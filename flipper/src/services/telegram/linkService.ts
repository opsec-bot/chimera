import { db } from '../../db/connection';
import { eq, and, or, sql } from 'drizzle-orm';
import { userTelegram, telegramLinkCodes } from '../../db/schema/other';
import crypto from 'crypto';

interface TelegramLinkRecord {
  user_id: number;
  telegram_user_id: string;
  telegram_username?: string | null;
  started_dm?: boolean;
  linked_at?: Date;
}

interface LinkCodeRecord {
  code: string;
  user_id: number;
  expires_at: Date;
  created_at?: Date;
}

export class TelegramLinkService {
  static async getLinkByUser(userId: number): Promise<TelegramLinkRecord | null> {
    try {
      const link = await db
        .select()
        .from(userTelegram)
        .where(eq(userTelegram.userId, userId))
        .limit(1);

      if (link.length === 0) return null;

      return {
        user_id: link[0].userId,
        telegram_user_id: link[0].telegramUserId,
        telegram_username: link[0].telegramUsername,
        started_dm: link[0].startedDm || undefined,
        linked_at: link[0].linkedAt || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getLinkByTelegramUsername(
    telegramUsername: string,
  ): Promise<TelegramLinkRecord | null> {
    try {
      if (!telegramUsername) return null;

      const link = await db
        .select()
        .from(userTelegram)
        .where(sql`LOWER(${userTelegram.telegramUsername}) = LOWER(${telegramUsername.trim()})`)
        .limit(1);

      if (link.length === 0) return null;

      return {
        user_id: link[0].userId,
        telegram_user_id: link[0].telegramUserId,
        telegram_username: link[0].telegramUsername,
        started_dm: link[0].startedDm || undefined,
        linked_at: link[0].linkedAt || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  static async saveLink(
    userId: number,
    telegramUserId: string,
    telegramUsername?: string,
  ): Promise<void> {
    try {
      // First ensure this telegram_user_id is not already linked to another user
      const existingLink = await db
        .select()
        .from(userTelegram)
        .where(
          and(
            eq(userTelegram.telegramUserId, telegramUserId),
            sql`${userTelegram.userId} != ${userId}`,
          ),
        )
        .limit(1);

      if (existingLink.length > 0) {
        throw new Error('Telegram account already linked to another user');
      }

      // Insert or update the link
      await db
        .insert(userTelegram)
        .values({
          userId,
          telegramUserId,
          telegramUsername: telegramUsername || null,
          startedDm: true,
          linkedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userTelegram.userId,
          set: {
            telegramUserId,
            telegramUsername: telegramUsername || null,
            startedDm: true,
            linkedAt: new Date(),
          },
        });
    } catch (error) {
      throw error;
    }
  }

  static async createLinkCode(userId: number): Promise<string> {
    try {
      const code = '' + Math.floor(100000 + Math.random() * 900000);
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      // Clean up expired codes (global + any existing codes for this user to avoid clutter)
      try {
        await db
          .delete(telegramLinkCodes)
          .where(
            or(sql`${telegramLinkCodes.expiresAt} <= NOW()`, eq(telegramLinkCodes.userId, userId)),
          );
      } catch (cleanupErr) {
        // Non-fatal; proceed to insert anyway
      }

      // Insert new code
      await db.insert(telegramLinkCodes).values({
        code,
        userId,
        expiresAt: expires,
      });

      return code;
    } catch (error) {
      throw error;
    }
  }

  static async consumeLinkCode(code: string): Promise<LinkCodeRecord | null> {
    try {
      const linkCode = await db
        .select()
        .from(telegramLinkCodes)
        .where(eq(telegramLinkCodes.code, code))
        .limit(1);

      if (linkCode.length === 0) return null;

      const codeRecord = linkCode[0];
      const expired = codeRecord.expiresAt.getTime() < Date.now();

      if (expired) {
        // Delete expired code
        await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.code, code));
        return null;
      }

      // Delete the consumed code
      await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.code, code));

      return {
        code: codeRecord.code,
        user_id: codeRecord.userId,
        expires_at: codeRecord.expiresAt,
        created_at: codeRecord.createdAt || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  static async cleanupExpiredCodes(): Promise<void> {
    try {
      await db.delete(telegramLinkCodes).where(sql`${telegramLinkCodes.expiresAt} <= NOW()`);
    } catch (error) {
      throw error;
    }
  }
}

export default TelegramLinkService;
