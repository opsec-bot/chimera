import { authenticator } from 'otplib';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import QRCode from 'qrcode';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/connection';
import { users, backupCodes } from '../db/schema';
import logger from '../utils/logger';

export interface TOTPSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

export interface TOTPVerifyResult {
  success: boolean;
  error?: string;
}

export class TOTPService {
  private static readonly APP_NAME = 'Flipper';

  /**
   * Generate a new TOTP secret and setup data for a user
   */
  static async setupTOTP(userId: number, userEmail: string): Promise<TOTPSetupResult> {
    try {
      // Generate a new secret
      const secret = authenticator.generateSecret();

      // Create the TOTP URL for QR code
      const otpauthUrl = authenticator.keyuri(userEmail, this.APP_NAME, secret);

      // Generate QR code as data URL
      const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

      // Generate backup codes (10 random 8-character codes)
      const backupCodesPlain = this.generateBackupCodes(10);

      // Store the secret in the database (encrypted)
      const encryptedSecret = this.encryptSecret(secret);
      await db
        .update(users)
        .set({
          totpSecret: encryptedSecret,
          // Don't enable TOTP yet - user needs to verify first
        })
        .where(eq(users.id, userId));

      // Store hashed backup codes in database
      await this.storeBackupCodes(userId, backupCodesPlain);

      // Audit log - TOTP setup initiated
      logger.info('TOTP setup initiated', {
        userId,
        userEmail,
        action: 'totp_setup_initiated',
        timestamp: new Date().toISOString(),
      });

      return {
        secret,
        qrCodeUrl,
        backupCodes: backupCodesPlain,
        manualEntryKey: secret.match(/.{1,4}/g)?.join(' ') || secret,
      };
    } catch (error) {
      logger.error('Error setting up TOTP:', { error });
      throw new Error('Failed to setup Two-Factor Authentication');
    }
  }

  /**
   * Verify a TOTP token and enable 2FA if first verification
   */
  static async verifyTOTP(
    userId: number,
    token: string,
    isInitialSetup = false,
  ): Promise<TOTPVerifyResult> {
    try {
      // Get user's TOTP secret
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!user[0]) {
        return { success: false, error: 'User not found' };
      }

      if (!user[0].totpSecret) {
        return { success: false, error: '2FA not configured for this user' };
      }

      // Decrypt the secret
      const secret = this.decryptSecret(user[0].totpSecret);

      // Verify the token
      const isValid = authenticator.verify({
        token: token.replace(/\s/g, ''), // Remove any spaces
        secret,
      });

      if (!isValid) {
        // Audit log - Invalid TOTP attempt
        logger.warn('Invalid TOTP verification attempt', {
          userId,
          action: 'totp_verification_failed',
          timestamp: new Date().toISOString(),
          reason: 'invalid_code',
        });
        return { success: false, error: 'Invalid authentication code' };
      }

      // If this is initial setup verification, enable TOTP
      if (isInitialSetup) {
        await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId));

        // Audit log - TOTP enabled successfully
        logger.info('TOTP enabled successfully', {
          userId,
          action: 'totp_enabled',
          timestamp: new Date().toISOString(),
          ip: 'backend_request', // This would need to be passed from the route if needed
        });
      }

      return { success: true };
    } catch (error) {
      logger.error('Error verifying TOTP:', { error });
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Disable TOTP for a user
   */
  static async disableTOTP(userId: number, token?: string): Promise<TOTPVerifyResult> {
    try {
      // If token provided, verify it first for security
      if (token) {
        const verification = await this.verifyTOTP(userId, token);
        if (!verification.success) {
          return verification;
        }
      }

      // Disable TOTP and clear secret
      await db
        .update(users)
        .set({
          totpEnabled: false,
          totpSecret: null,
        })
        .where(eq(users.id, userId));

      // Clear backup codes
      await this.clearBackupCodes(userId);

      // Audit log - TOTP disabled
      logger.info('TOTP disabled', {
        userId,
        action: 'totp_disabled',
        timestamp: new Date().toISOString(),
        method: token ? 'with_verification' : 'without_verification',
      });
      return { success: true };
    } catch (error) {
      logger.error('Error disabling TOTP:', { error });
      return { success: false, error: 'Failed to disable 2FA' };
    }
  }

  /**
   * Check if user has TOTP enabled
   */
  static async isTOTPEnabled(userId: number): Promise<boolean> {
    try {
      const user = await db
        .select({ totpEnabled: users.totpEnabled })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return user[0]?.totpEnabled || false;
    } catch (error) {
      logger.error('Error checking TOTP status:', { error });
      return false;
    }
  }

  /**
   * Generate backup codes for emergency access
   */
  private static generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code.match(/.{1,2}/g)?.join('-') || code);
    }
    return codes;
  }

  /**
   * Encrypt TOTP secret for database storage
   */
  private static encryptSecret(secret: string): string {
    // Use AES-256-GCM for encryption
    const algorithm = 'aes-256-gcm';
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('Missing ENCRYPTION_KEY environment variable');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt TOTP secret from database
   */
  private static decryptSecret(encryptedSecret: string): string {
    const algorithm = 'aes-256-gcm';
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('Missing ENCRYPTION_KEY environment variable');

    const parts = encryptedSecret.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted secret format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Validate TOTP token format
   */
  static isValidTokenFormat(token: string): boolean {
    const cleanToken = token.replace(/\s/g, '');
    return /^\d{6}$/.test(cleanToken);
  }

  /**
   * Generate a user-friendly manual entry key (formatted with spaces)
   */
  static formatManualEntryKey(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  }

  /**
   * Store hashed backup codes in the database
   */
  private static async storeBackupCodes(userId: number, codes: string[]): Promise<void> {
    try {
      // Clear any existing backup codes for this user
      await db.delete(backupCodes).where(eq(backupCodes.userId, userId));

      // Hash and store new backup codes
      const saltRounds = 12;
      const hashedCodes = await Promise.all(
        codes.map(async (code) => {
          const hash = await bcrypt.hash(code.replace(/[-\s]/g, '').toLowerCase(), saltRounds);
          return {
            userId,
            codeHash: hash,
          };
        }),
      );

      await db.insert(backupCodes).values(hashedCodes);

      logger.info('Backup codes stored', {
        userId,
        codeCount: codes.length,
        action: 'backup_codes_generated',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error storing backup codes:', { error, userId });
      throw new Error('Failed to store backup codes');
    }
  }

  /**
   * Verify a backup code
   */
  static async verifyBackupCode(userId: number, code: string): Promise<TOTPVerifyResult> {
    try {
      // Get all unused backup codes for the user
      const userBackupCodes = await db
        .select()
        .from(backupCodes)
        .where(and(eq(backupCodes.userId, userId), isNull(backupCodes.usedAt)));

      if (userBackupCodes.length === 0) {
        return { success: false, error: 'No backup codes available' };
      }

      // Clean the provided code (remove spaces/dashes, lowercase)
      const cleanCode = code.replace(/[-\s]/g, '').toLowerCase();

      // Check against each stored backup code
      for (const storedCode of userBackupCodes) {
        const isValid = await bcrypt.compare(cleanCode, storedCode.codeHash);
        if (isValid) {
          // Mark the backup code as used
          await db
            .update(backupCodes)
            .set({ usedAt: new Date() })
            .where(eq(backupCodes.id, storedCode.id));

          // Audit log - Backup code used
          logger.info('Backup code used successfully', {
            userId,
            backupCodeId: storedCode.id,
            action: 'backup_code_used',
            timestamp: new Date().toISOString(),
          });

          return { success: true };
        }
      }

      // Audit log - Invalid backup code attempt
      logger.warn('Invalid backup code verification attempt', {
        userId,
        action: 'backup_code_verification_failed',
        timestamp: new Date().toISOString(),
      });

      return { success: false, error: 'Invalid backup code' };
    } catch (error) {
      logger.error('Error verifying backup code:', { error, userId });
      return { success: false, error: 'Backup code verification failed' };
    }
  }

  /**
   * Get count of remaining backup codes for a user
   */
  static async getRemainingBackupCodes(userId: number): Promise<number> {
    try {
      const remainingCodes = await db
        .select()
        .from(backupCodes)
        .where(and(eq(backupCodes.userId, userId), isNull(backupCodes.usedAt)));

      return remainingCodes.length;
    } catch (error) {
      logger.error('Error getting backup codes count:', { error, userId });
      return 0;
    }
  }

  /**
   * Clean up backup codes when TOTP is disabled
   */
  private static async clearBackupCodes(userId: number): Promise<void> {
    try {
      await db.delete(backupCodes).where(eq(backupCodes.userId, userId));

      logger.info('Backup codes cleared', {
        userId,
        action: 'backup_codes_cleared',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error clearing backup codes:', { error, userId });
    }
  }
}

export default TOTPService;
