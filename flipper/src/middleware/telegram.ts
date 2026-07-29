import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth';
import { db } from '../db/connection';
import { userTelegram } from '../db/schema/other';
import { eq } from 'drizzle-orm';

/**
 * Checks if the authenticated user has a linked telegram account.
 * For JSON/API routes – returns 428 if not linked.
 */
export async function requireTelegramLinked(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const telegramLink = await db
      .select()
      .from(userTelegram)
      .where(eq(userTelegram.userId, req.user.id))
      .limit(1);

    const linked = telegramLink.length > 0;

    if (!linked) {
      return res
        .status(428)
        .json({ error: 'Telegram link required', telegram_link_required: true });
    }
    next();
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to verify telegram link' });
  }
}

/**
 * HTML variant – redirects to /auth/link-telegram if the user has not linked yet.
 */
export async function requireTelegramLinkedHTML(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) return res.redirect('/auth');

    const telegramLink = await db
      .select()
      .from(userTelegram)
      .where(eq(userTelegram.userId, req.user.id))
      .limit(1);

    const linked = telegramLink.length > 0;

    if (!linked) return res.redirect('/auth/link-telegram');
    next();
  } catch {
    return res.redirect('/auth/link-telegram');
  }
}
