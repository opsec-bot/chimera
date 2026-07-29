import { Request, Response, NextFunction } from 'express';

interface LimiterOptions {
  windowMs: number; // time window in ms
  max: number; // max hits allowed in window
  key?(req: Request): string; // custom key function
  onLimit?(req: Request, res: Response): void; // custom handler
  includeUsername?: boolean; // append username to key if present in body
}

interface Bucket {
  timestamps: number[];
}

function now() {
  return Date.now();
}

export function createRateLimiter(opts: LimiterOptions) {
  const store: Map<string, Bucket> = new Map();
  const { windowMs, max } = opts;
  const keyFn =
    opts.key ||
    ((req: Request) =>
      (req.ip || (req.connection as any).remoteAddress || 'unknown').replace(/^::ffff:/, ''));

  return function limiter(req: Request, res: Response, next: NextFunction) {
    try {
      let k = keyFn(req);
      if (opts.includeUsername) {
        const u =
          req.body && (req.body.username || req.body.user)
            ? String(req.body.username || req.body.user).toLowerCase()
            : '';
        if (u) k += `:${u}`;
      }
      const bucket = store.get(k) || { timestamps: [] };
      const cutoff = now() - windowMs;
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      bucket.timestamps.push(now());
      store.set(k, bucket);
      if (bucket.timestamps.length > max) {
        if (opts.onLimit) return opts.onLimit(req, res);
        return res.status(429).json({ error: 'Too many requests' });
      }
    } catch {
      // fail open intentionally
    }
    next();
  };
}

export const loginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  includeUsername: true,
});
export const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 15 });
export const inviteCreateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  key: (req) => `inv:${(req.session as any)?.userId || 'anon'}`,
});
export const telegramInitLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 40,
  key: (req) => `tginit:${(req.session as any)?.userId || 'anon'}`,
});
export const passwordResetConsumeLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 25 });
export const passwordResetRequestLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60 });
export const totpVerifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  includeUsername: true, // Include username in rate limiting key
});

// Validation helpers
export function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{3,32}$/.test(u);
}

export function isValidInviteCode(c: string): boolean {
  return /^[a-fA-F0-9]{16,64}$/.test(c) || /^[A-Z0-9_-]{6,64}$/i.test(c);
}

export function sanitizeString(s: unknown, max = 128): string | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}
