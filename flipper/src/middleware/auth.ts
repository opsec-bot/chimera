import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/userService';
import { SubscriptionService } from '../services/subscriptionService';
import { Logger } from '../utils/logger';

// Central path exemption + subscription gating utilities
const SUBSCRIPTION_EXEMPT_PATH_PREFIXES = [
  '/auth/me',
  '/auth/login',
  '/auth/register',
  '/auth/logout',
  '/auth/csrf',
  '/auth/invites',
  '/auth/telegram',
  '/auth/link-telegram',
  '/auth/totp', // 2FA/TOTP management routes
  '/subscriptions', // landing page explaining plans
  '/subscription/tiers',
  '/subscription/status',
  '/subscription/purchase',
  '/subscription/history',
  '/subscription/extend',
  '/subscription-codes/redeem', // allow users to redeem codes without active subscription
  '/payment', // invoice status / polling endpoints
  '/dashboard/api/subscription-status', // allow checking status pre-subscription
  '/dashboard/api/notifications',
  '/dashboard/api/live-updates',
  '/dashboard/api/payment-status',
];

function isSubscriptionExemptPath(path: string): boolean {
  const p = path.toLowerCase();
  return SUBSCRIPTION_EXEMPT_PATH_PREFIXES.some((pref) => p === pref || p.startsWith(pref));
}

async function ensureSubscription(userId: number): Promise<boolean> {
  return SubscriptionService.hasActiveSubscription(userId).catch((e) => {
    Logger.warn('subscription check failed (fail-open)', {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
    return true; // fail open on transient errors
  });
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    isAdmin?: boolean;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    isAdmin: boolean;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await UserService.getUserById(req.session.userId);
    if (!user || user.username.startsWith('__deleted__')) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isAdmin = !!req.session.isAdmin;
    const fullPath = (req.originalUrl || req.url || '').toLowerCase();
    if (!isAdmin && !isSubscriptionExemptPath(fullPath)) {
      const hasSub = await ensureSubscription(user.id);
      if (!hasSub) {
        return res.status(403).json({ error: 'Active subscription required' });
      }
    }

    req.user = { id: user.id, username: user.username, isAdmin };
    req.session.username = user.username;
    req.session.isAdmin = isAdmin;
    next();
  } catch (e) {
    Logger.error('requireAuth failure', { error: e instanceof Error ? e.message : String(e) });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function requireAuthHTML(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect('/auth');
    }
    const user = await UserService.getUserById(req.session.userId);
    if (!user || user.username.startsWith('__deleted__')) {
      req.session.destroy(() => {});
      return res.redirect('/auth');
    }
    const isAdmin = !!req.session.isAdmin;
    const fullPath = (req.originalUrl || req.url || '').toLowerCase();
    if (!isAdmin && !isSubscriptionExemptPath(fullPath)) {
      const hasSub = await ensureSubscription(user.id);
      if (!hasSub) {
        return res.redirect('/subscriptions');
      }
    }
    req.user = { id: user.id, username: user.username, isAdmin };
    req.session.username = user.username;
    next();
  } catch (e) {
    return res.redirect('/auth');
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

export function requireAdminHTML(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  requireAuthHTML(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.redirect('/dashboard'); // Redirect non-admins to dashboard instead of auth
    }
    next();
  });
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.session.userId) {
    req.user = {
      id: req.session.userId,
      username: req.session.username!,
      isAdmin: req.session.isAdmin || false,
    };
  }
  next();
}
