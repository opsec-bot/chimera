import axios from 'axios';
import { db } from '../../db/connection';
import { eq } from 'drizzle-orm';
import { telegramResetConfig } from '../../db/schema/other';
import { Logger } from '../../utils/logger';

export interface TelegramResetConfig {
  bot_token: string | null;
  bot_username: string | null;
  enabled: boolean;
}

export class TelegramResetService {
  static async getConfig(): Promise<TelegramResetConfig> {
    try {
      const config = await db
        .select()
        .from(telegramResetConfig)
        .where(eq(telegramResetConfig.id, 1))
        .limit(1);

      if (config.length === 0) {
        return { bot_token: null, bot_username: null, enabled: false };
      }

      const row = config[0];
      return {
        bot_token: row.botToken || null,
        bot_username: row.botUsername || null,
        enabled: Boolean(row.enabled),
      };
    } catch (error) {
      throw error;
    }
  }

  static async updateConfig(partial: Partial<TelegramResetConfig>): Promise<void> {
    try {
      // Check if config exists
      const existing = await db
        .select({ id: telegramResetConfig.id })
        .from(telegramResetConfig)
        .where(eq(telegramResetConfig.id, 1))
        .limit(1);

      if (existing.length > 0) {
        // Update existing config
        await db
          .update(telegramResetConfig)
          .set({
            botToken: partial.bot_token ?? undefined,
            botUsername: partial.bot_username ?? undefined,
            enabled: partial.enabled ?? undefined,
            updatedAt: new Date(),
          })
          .where(eq(telegramResetConfig.id, 1));
      } else {
        // Insert new config
        await db.insert(telegramResetConfig).values({
          id: 1,
          botToken: partial.bot_token ?? null,
          botUsername: partial.bot_username ?? null,
          enabled: partial.enabled ?? false,
        });
      }
    } catch (error) {
      throw error;
    }
  }

  static async testToken(
    botToken: string,
  ): Promise<{ success: boolean; username?: string; error?: string }> {
    try {
      const r = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, { timeout: 8000 });
      if (r.data?.ok) {
        return { success: true, username: r.data.result?.username };
      }
      return { success: false, error: r.data?.description || 'Unknown error' };
    } catch (e: any) {
      // Provide user-friendly error messages for common cases
      if (e?.response?.status === 404) {
        return {
          success: false,
          error: 'Invalid bot token. Please check your token and try again.',
        };
      } else if (e?.response?.status === 401) {
        return { success: false, error: 'Invalid bot token. The token is not authorized.' };
      } else if (e?.code === 'ENOTFOUND' || e?.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Unable to connect to Telegram. Please check your internet connection.',
        };
      } else if (e?.code === 'ETIMEDOUT') {
        return { success: false, error: 'Request timed out. Please try again.' };
      } else {
        return {
          success: false,
          error: e?.message || 'Failed to validate bot token. Please try again.',
        };
      }
    }
  }
}
