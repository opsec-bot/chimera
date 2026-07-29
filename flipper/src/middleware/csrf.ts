import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Exempt unauth endpoints (lowercase)
const EXEMPT_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/password/request',
  '/auth/password/reset',
  '/auth/csrf',
  '/auth/logout', // allow logout even if client missed token (low-risk action)
]);

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    userId?: number;
  }
}

export function ensureCsrfToken(req: Request, rotate = false) {
  if (!req.session) return;
  if (!req.session.csrfToken || rotate) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  // Set a non-HttpOnly cookie for double-submit pattern (defense in depth)
  // Use SameSite=Strict aligning with session cookie; mark Secure in production
  const secure = process.env.NODE_ENV === 'production';
  if (!req.res?.headersSent) {
    req.res?.cookie('csrf_token', req.session.csrfToken, {
      httpOnly: false,
      sameSite: 'strict',
      secure,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
}

export function getOrCreateCsrfToken(req: Request, rotate = false): string | undefined {
  ensureCsrfToken(req, rotate);
  return req.session?.csrfToken;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  try {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.session || !req.session.userId) return next();
    const path = req.path.toLowerCase();
    if (EXEMPT_PATHS.has(path)) return next();
    const headerToken = (req.headers['x-csrf-token'] || req.headers['csrf-token']) as
      | string
      | undefined;
    const cookieToken = (req.cookies && (req.cookies['csrf_token'] as string)) || undefined;
    // Accept if: header matches session, AND (optional) cookie matches session (double-submit)
    // We enforce header must match; if cookie present it must also match; if cookie missing we still allow (graceful until all clients updated)
    const sessionToken = req.session.csrfToken;
    if (!headerToken || headerToken !== sessionToken) {
      return res.status(403).json({ error: 'CSRF token invalid or missing' });
    }
    if (cookieToken && cookieToken !== sessionToken) {
      return res.status(403).json({ error: 'CSRF token cookie mismatch' });
    }
  } catch {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  next();
}
