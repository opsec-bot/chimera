import express from 'express';
import { UserService } from '../services/userService';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { TelegramLinkService } from '../services/telegram/linkService';
import { PasswordResetService } from '../services/passwordResetService';
import { TelegramResetService } from '../services/telegram/resetService';
import TOTPService from '../services/totpService';
import { db } from '../db/connection';
import { userTelegram } from '../db/schema/other';
import { users } from '../db/schema/users';
import { eq } from 'drizzle-orm';
import {
  loginLimiter,
  registerLimiter,
  telegramInitLimiter,
  passwordResetConsumeLimiter,
  totpVerifyLimiter,
  isValidUsername,
  isValidInviteCode,
  sanitizeString,
} from '../middleware/rateLimit';
import Logger from '../utils/logger';
import { getOrCreateCsrfToken, ensureCsrfToken } from '../middleware/csrf';

const router = express.Router();

// Register
const UNIFORM_AUTH_ERROR = 'Invalid credentials';
router.post('/register', registerLimiter, async (req, res) => {
  try {
    let { username, password, inviteCode } = req.body || {};
    username = sanitizeString(username, 32) || '';
    inviteCode = sanitizeString(inviteCode, 64) || '';

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: UNIFORM_AUTH_ERROR });
    }
    if (!inviteCode || !isValidInviteCode(inviteCode)) {
      // Explicit invalid invite code feedback (frontend will display this instead of generic credentials message)
      return res.status(400).json({ error: 'Invalid invite code' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: UNIFORM_AUTH_ERROR });
    }

    if (!username || !password || !inviteCode) {
      return res.status(400).json({ error: UNIFORM_AUTH_ERROR });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const user = await UserService.createUser(username, password, inviteCode, ipAddress);

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    // Rotate CSRF token after privilege change (new session data)
    ensureCsrfToken(req, true);
    const csrf = req.session.csrfToken;
    // New accounts must link telegram before continuing to dashboard; front-end should redirect.
    res.json({
      message: 'Registration successful – telegram linking required',
      user: { id: user.id, username: user.username },
      needs_telegram_link: true,
      csrfToken: csrf,
    });
  } catch (error: any) {
    // Preserve specific invalid invite code message if thrown upstream
    if (error?.message === 'Invalid invite code') {
      return res.status(400).json({ error: 'Invalid invite code' });
    }
    res.status(400).json({ error: UNIFORM_AUTH_ERROR });
  }
});

// Login (with 2FA support)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    let { username, password, totpCode, backupCode } = req.body || {};
    username = sanitizeString(username, 32) || '';
    if (!isValidUsername(username) || !username || !password) {
      return res.status(400).json({ error: UNIFORM_AUTH_ERROR });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const user = await UserService.authenticateUser(username, password, ipAddress);

    if (!user) {
      return res.status(401).json({ error: UNIFORM_AUTH_ERROR });
    }

    // Check if user has 2FA enabled
    const isTotpEnabled = await TOTPService.isTOTPEnabled(user.id);

    if (isTotpEnabled) {
      // 2FA is enabled, require TOTP code or backup code
      if (!totpCode && !backupCode) {
        // First step of 2FA login - password verified, now need TOTP or backup code
        const remainingBackupCodes = await TOTPService.getRemainingBackupCodes(user.id);
        return res.json({
          requireTotp: true,
          message: 'Please enter your 6-digit authentication code or backup code',
          temporaryToken: user.id.toString(), // Temporary identifier for next step
          backupCodesAvailable: remainingBackupCodes,
        });
      }

      let authVerified = false;

      // Try TOTP verification first if provided
      if (totpCode) {
        const totpVerification = await TOTPService.verifyTOTP(user.id, totpCode);
        authVerified = totpVerification.success;

        if (!authVerified) {
          return res.status(401).json({
            error: totpVerification.error || 'Invalid authentication code',
          });
        }
      }
      // Try backup code if TOTP wasn't provided or failed
      else if (backupCode) {
        const backupVerification = await TOTPService.verifyBackupCode(user.id, backupCode);
        authVerified = backupVerification.success;

        if (!authVerified) {
          return res.status(401).json({
            error: backupVerification.error || 'Invalid backup code',
          });
        }
      }

      if (!authVerified) {
        return res.status(401).json({
          error: 'Authentication code required',
        });
      }
    }

    // Login successful (either no 2FA or 2FA verified)
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    // Rotate CSRF token on login
    ensureCsrfToken(req, true);
    const csrf = req.session.csrfToken;
    // Check if telegram linked
    const link = await TelegramLinkService.getLinkByUser(user.id);
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        // Admin accounts are exempt from mandatory Telegram linking
        needsTelegramLink: !link && !user.isAdmin,
        totpEnabled: isTotpEnabled,
      },
      csrfToken: csrf,
    });
  } catch (error: any) {
    Logger.error('Login error:', { error });
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  // Rotate token (will be invalidated with session destroy, but for completeness)
  if (req.session) {
    ensureCsrfToken(req, true);
  }
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// 2FA/TOTP Routes

// Setup TOTP (Two-Factor Authentication)
router.post('/totp/setup', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await UserService.getUserById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if TOTP is already enabled
    const isEnabled = await TOTPService.isTOTPEnabled(user.id);
    if (isEnabled) {
      return res.status(400).json({ error: 'Two-factor authentication is already enabled' });
    }

    // Generate TOTP setup data
    const setupData = await TOTPService.setupTOTP(user.id, user.username);

    res.json({
      message: 'TOTP setup data generated',
      secret: setupData.secret,
      qrCodeUrl: setupData.qrCodeUrl,
      backupCodes: setupData.backupCodes,
      manualEntryKey: setupData.manualEntryKey,
    });
  } catch (error) {
    Logger.error('TOTP setup error:', { error });
    res.status(500).json({ error: 'Failed to setup two-factor authentication' });
  }
});

// Verify and enable TOTP
router.post(
  '/totp/verify',
  requireAuth,
  totpVerifyLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { token } = req.body;

      if (!token || !TOTPService.isValidTokenFormat(token)) {
        return res.status(400).json({ error: 'Invalid authentication code format' });
      }

      // Verify the TOTP token and enable 2FA
      const verification = await TOTPService.verifyTOTP(req.user!.id, token, true);

      if (!verification.success) {
        return res.status(400).json({ error: verification.error || 'Invalid authentication code' });
      }

      res.json({
        message: 'Two-factor authentication enabled successfully',
        enabled: true,
      });
    } catch (error) {
      Logger.error('TOTP verification error:', { error });
      res.status(500).json({ error: 'Failed to verify authentication code' });
    }
  },
);

// Disable TOTP
router.post(
  '/totp/disable',
  requireAuth,
  totpVerifyLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { token } = req.body;

      // Check if TOTP is currently enabled
      const isEnabled = await TOTPService.isTOTPEnabled(req.user!.id);
      if (!isEnabled) {
        return res.status(400).json({ error: 'Two-factor authentication is not enabled' });
      }

      // Verify current TOTP token before disabling
      if (!token || !TOTPService.isValidTokenFormat(token)) {
        return res.status(400).json({ error: 'Authentication code required to disable 2FA' });
      }

      const result = await TOTPService.disableTOTP(req.user!.id, token);

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to disable 2FA' });
      }

      res.json({
        message: 'Two-factor authentication disabled successfully',
        enabled: false,
      });
    } catch (error) {
      Logger.error('TOTP disable error:', { error });
      res.status(500).json({ error: 'Failed to disable two-factor authentication' });
    }
  },
);

// Get TOTP status
router.get('/totp/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isEnabled = await TOTPService.isTOTPEnabled(req.user!.id);
    res.json({ totpEnabled: isEnabled });
  } catch (error) {
    Logger.error('TOTP status error:', { error });
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

// Get current user
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await UserService.getUserById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check Telegram linking status
    const telegramLink = await TelegramLinkService.getLinkByUser(user.id);

    // Check TOTP status
    const totpEnabled = await TOTPService.isTOTPEnabled(user.id);

    const userWithTelegram = {
      id: user.id,
      username: user.username,
      is_admin: user.isAdmin,
      created_at: user.createdAt,
      last_login: user.lastLogin || null,
      invited_by: user.invitedBy || null,
      // deliberately omit ip_address for privacy/security; internal logs still retain it
      telegram_linked: !!telegramLink,
      telegram_username: telegramLink?.telegram_username || null,
      telegram_user_id: telegramLink?.telegram_user_id || null,
      totp_enabled: totpEnabled,
    };

    const csrf = getOrCreateCsrfToken(req);
    res.json({ user: userWithTelegram, csrfToken: csrf });
  } catch (error: any) {
    Logger.error('Get user error:', { error });
    res.status(500).json({ error: error.message });
  }
});

// Explicit CSRF token fetch (optional for clients that want a dedicated call)
router.get('/csrf', (req, res) => {
  const token = getOrCreateCsrfToken(req as any);
  res.json({ csrfToken: token });
});

// Update password
router.post('/update-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All password fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Check password strength
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumbers = /\d/.test(newPassword);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
      return res
        .status(400)
        .json({ error: 'Password must contain uppercase, lowercase, and numbers' });
    }

    await UserService.updatePassword(req.user!.id, currentPassword, newPassword);
    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    if (error.message === 'Current password is incorrect') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get user invites
router.get('/invites', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const invites = await UserService.getUserInvites(req.user!.id);
    res.json({ invites });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new invite
import { inviteCreateLimiter } from '../middleware/rateLimit';
router.post(
  '/invites',
  requireAuth,
  inviteCreateLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const code = await UserService.createInvite(req.user!.id);
      res.json({ message: 'Invite created successfully', code });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// --- Telegram Linking & Password Reset Extensions ---

// Previously served a static link-telegram page. Frontend handles the UI; keep
// an API response for compatibility/verification.
router.get('/link-telegram', (req, res) => {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: 'unauthenticated' });
  res.json({
    message: 'Telegram link frontend is served separately. Use /auth/telegram/* API endpoints.',
  });
});

// Settings page convenience: get full telegram link status
router.get('/telegram/full-status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const link = await TelegramLinkService.getLinkByUser(req.user!.id);
    res.json({ linked: !!link, link });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Initialize Telegram link (generate code for deep link alternative)
router.post(
  '/telegram/init-link',
  requireAuth,
  telegramInitLimiter,
  async (req: AuthenticatedRequest, res) => {
    try {
      const existing = await TelegramLinkService.getLinkByUser(req.user!.id);
      if (existing) {
        return res.json({ linked: true, telegram_username: existing.telegram_username });
      }
      const code = await TelegramLinkService.createLinkCode(req.user!.id);
      res.json({ linked: false, code, instructions: `Open your bot and send /link ${code}` });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to generate link code' });
    }
  },
);

// Telegram link status
router.get('/telegram/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const link = await TelegramLinkService.getLinkByUser(req.user!.id);
    res.json({ linked: !!link, telegram_username: link?.telegram_username });
  } catch {
    res.status(500).json({ error: 'Failed to fetch link status' });
  }
});

// Unlink Telegram account
router.post('/telegram/unlink', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await db.delete(userTelegram).where(eq(userTelegram.userId, req.user!.id));
    res.json({ success: true, unlinked: true });
  } catch (err) {
    Logger.error('telegram unlink error', { err });
    res.status(500).json({ error: 'Internal error' });
  }
});

// Public minimal telegram config (bot username only) for UI hints
router.get('/telegram/bot-info', async (_req, res) => {
  try {
    const resetCfg = await TelegramResetService.getConfig();
    const base = {
      enabled: !!resetCfg.enabled,
      configured: !!resetCfg.bot_token,
      bot_username: resetCfg.bot_username || null,
    };
    if (resetCfg.bot_username) {
      return res.json(base);
    }
    if (resetCfg.bot_token) {
      try {
        const axios = require('axios');
        const r = await axios.get(`https://api.telegram.org/bot${resetCfg.bot_token}/getMe`, {
          timeout: 5000,
        });
        if (r.data?.ok && r.data.result?.username) {
          await TelegramResetService.updateConfig({ bot_username: r.data.result.username });
          return res.json({ ...base, bot_username: r.data.result.username });
        }
      } catch (_) {
        // ignore
      }
    }
    res.json(base);
  } catch (e) {
    res.json({ enabled: false, configured: false, bot_username: null });
  }
});

// Password reset flow UI is handled by the frontend. Provide an API-friendly
// response here instead of serving static HTML.
router.get('/reset', (_req, res) => {
  res.json({
    message: 'Password reset frontend is served separately. Use API endpoints to request/resets.',
  });
});

// Rate limiting memory maps
const passwordRequestIpMap: Map<string, number[]> = new Map();
const passwordRequestUserMap: Map<string, number[]> = new Map();
function pruneAndCount(map: Map<string, number[]>, key: string, windowMs: number): number {
  const now = Date.now();
  const arr = map.get(key) || [];
  const filtered = arr.filter((ts) => now - ts < windowMs);
  filtered.push(now);
  map.set(key, filtered);
  return filtered.length;
}
const PASSWORD_REQ_WINDOW = 15 * 60 * 1000;
const PASSWORD_REQ_MAX_PER_IP = 20;
const PASSWORD_REQ_MAX_PER_USER = 5;
function rateLimitPasswordRequest(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const ip = (req.ip || (req.connection as any).remoteAddress || 'unknown').replace(
      /^::ffff:/,
      '',
    );
    const username = (req.body && req.body.username ? String(req.body.username) : '').toLowerCase();
    const ipCount = pruneAndCount(passwordRequestIpMap, ip, PASSWORD_REQ_WINDOW);
    if (ipCount > PASSWORD_REQ_MAX_PER_IP)
      return res.json({ message: 'If the account is linked, a reset was sent.' });
    if (username) {
      const userCount = pruneAndCount(passwordRequestUserMap, username, PASSWORD_REQ_WINDOW);
      if (userCount > PASSWORD_REQ_MAX_PER_USER)
        return res.json({ message: 'If the account is linked, a reset was sent.' });
    }
  } catch {}
  next();
}

// Forgot password request
router.post('/password/request', rateLimitPasswordRequest, async (req, res) => {
  const generic = { message: 'If the account is linked, a reset was sent.' };
  try {
    const { username } = req.body || {};
    if (!username) return res.json(generic);
    const user = await UserService.getUserByUsername(username);
    if (!user) return res.json(generic);
    const link = await TelegramLinkService.getLinkByUser(user.id);
    if (!link) return res.json(generic);
    const { code } = await PasswordResetService.createToken(user.id);
    const msg = `Password reset requested\nCode: ${code}\nExpires in 15 minutes.`;
    const resetCfg = await TelegramResetService.getConfig();
    let sent = false;
    if (resetCfg.bot_token && resetCfg.enabled) {
      try {
        const axios = require('axios');
        const r = await axios.post(
          `https://api.telegram.org/bot${resetCfg.bot_token}/sendMessage`,
          { chat_id: link.telegram_user_id, text: msg },
        );
        sent = !!(r.data && r.data.ok);
      } catch (_) {
        sent = false;
      }
    }
    if (!sent) return res.json({ message: 'Please start the bot then retry.' });
    res.json(generic);
  } catch (e) {
    res.json(generic);
  }
});

// New: initiate reset by telegram username or telegram id (no enumeration)
router.post('/password/request-telegram', rateLimitPasswordRequest, async (req, res) => {
  const generic = { message: 'If the account is linked, a reset was sent.' };
  try {
    let { telegramUsername } = req.body || {};
    if (!telegramUsername || typeof telegramUsername !== 'string') return res.json(generic);
    telegramUsername = telegramUsername.trim();

    let link: any = null;
    // If looks like numeric telegram id (6+ digits), attempt to lookup by telegram_user_id
    if (/^\d{6,}$/.test(telegramUsername)) {
      const result = await db
        .select()
        .from(userTelegram)
        .where(eq(userTelegram.telegramUserId, telegramUsername))
        .limit(1);

      // Map Drizzle result to expected format
      link =
        result.length > 0
          ? {
              user_id: result[0].userId,
              telegram_user_id: result[0].telegramUserId,
              telegram_username: result[0].telegramUsername,
            }
          : null;
    }

    // If not found by id, or input not numeric, try username lookup (strip leading @)
    if (!link) {
      const usernameToTry = telegramUsername.replace(/^@/, '');
      link = await TelegramLinkService.getLinkByTelegramUsername(usernameToTry);
    }

    if (!link) return res.json(generic);

    // Ensure user exists
    const userResult = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, link.user_id))
      .limit(1);

    const userRow = userResult.length > 0 ? userResult[0] : null;
    if (!userRow) return res.json(generic);

    const { code } = await PasswordResetService.createToken(link.user_id);
    const msg = `Password reset requested for username: \`${userRow.username}\`\nCode: \`${code}\`\nExpires in 15 minutes.`;
    const resetCfg = await TelegramResetService.getConfig();
    let sent = false;
    if (resetCfg.bot_token && resetCfg.enabled) {
      try {
        const axios = require('axios');
        const r = await axios.post(
          `https://api.telegram.org/bot${resetCfg.bot_token}/sendMessage`,
          {
            chat_id: link.telegram_user_id,
            text: msg,
            parse_mode: 'Markdown',
          },
        );
        sent = !!(r.data && r.data.ok);
      } catch (_) {
        sent = false;
      }
    }
    if (!sent) return res.json({ message: 'Please start the bot then retry.' });
    res.json(generic);
  } catch (err) {
    // Keep generic response to avoid user enumeration
    Logger.warn('password request-telegram error', { error: (err as any).message });
    res.json(generic);
  }
});

// Perform password reset
router.post('/password/reset', passwordResetConsumeLimiter, async (req, res) => {
  try {
    const { token, code, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({ error: 'Invalid new password' });
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword))
      return res.status(400).json({ error: 'Password must contain upper, lower, number' });

    let record: any = null;
    if (token) {
      record = await PasswordResetService.validateByToken(token);
    } else if (code) {
      record = await PasswordResetService.validateByCode(code);
    }
    if (!record) return res.status(400).json({ error: 'Invalid or expired reset' });

    const bcrypt = require('bcryptjs');
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await new Promise<void>((resolve, reject) => {
      const stmt = (UserService as any).db || require('../config/database').db;
      stmt.run(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, record.user_id],
        (err: any) => (err ? reject(err) : resolve()),
      );
    });
    await PasswordResetService.markUsed(record.token_hash);
    res.json({ message: 'Password reset successful' });
  } catch {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
