import crypto from 'crypto';
import { db } from '../db/connection';
import { eq, and, or, lt, sql } from 'drizzle-orm';
import { passwordResetTokens } from '../db/schema/other';
import { Logger } from '../utils/logger';

interface ResetTokenRecord {
  tokenHash: string;
  userId: number;
  code: string | null;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export class PasswordResetService {
  static generateRawToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  static generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static async createToken(
    userId: number,
    ttlMinutes = 15,
  ): Promise<{ token: string; code: string }> {
    try {
      const token = this.generateRawToken();
      const tokenHash = this.hashToken(token);
      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        tokenHash,
        userId,
        code,
        expiresAt,
        used: false,
        createdAt: new Date(),
      });

      return { token, code };
    } catch (error) {
      Logger.error('Failed to insert password reset token', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  static async validateByToken(rawToken: string): Promise<ResetTokenRecord | null> {
    try {
      const tokenHash = this.hashToken(rawToken);
      const result = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            eq(passwordResetTokens.used, false),
            sql`${passwordResetTokens.expiresAt} > NOW()`,
          ),
        )
        .limit(1);

      return result.length > 0
        ? {
            ...result[0],
            used: result[0].used || false,
            createdAt: result[0].createdAt || new Date(),
          }
        : null;
    } catch (error) {
      throw error;
    }
  }

  static async validateByCode(code: string): Promise<ResetTokenRecord | null> {
    try {
      const result = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.code, code),
            eq(passwordResetTokens.used, false),
            sql`${passwordResetTokens.expiresAt} > NOW()`,
          ),
        )
        .limit(1);

      return result.length > 0
        ? {
            ...result[0],
            used: result[0].used || false,
            createdAt: result[0].createdAt || new Date(),
          }
        : null;
    } catch (error) {
      throw error;
    }
  }

  static async markUsed(tokenHash: string): Promise<void> {
    try {
      await db
        .update(passwordResetTokens)
        .set({ used: true })
        .where(eq(passwordResetTokens.tokenHash, tokenHash));
    } catch (error) {
      throw error;
    }
  }

  static async cleanupExpired(): Promise<void> {
    try {
      await db
        .delete(passwordResetTokens)
        .where(
          or(eq(passwordResetTokens.used, true), sql`${passwordResetTokens.expiresAt} <= NOW()`),
        );
    } catch (error) {
      Logger.warn('Password reset cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export default PasswordResetService;
