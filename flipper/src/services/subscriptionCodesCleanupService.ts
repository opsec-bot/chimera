import cron from 'node-cron';
import { db } from '../db/connection';
import { subscriptionCodes } from '../db/schema/subscriptionCodes';
import { eq, and, lt, ne, isNotNull, gte } from 'drizzle-orm';
import { Logger } from '../utils/logger';

/**
 * Subscription Codes Cleanup Service
 * Handles automatic expiration of subscription codes and cleanup tasks
 */
export class SubscriptionCodesCleanupService {
  private static cleanupJobStarted = false;

  /**
   * Start the automatic cleanup job
   * Runs every hour to mark expired codes
   */
  static startCleanupJob(): void {
    if (this.cleanupJobStarted) {
      Logger.warn('Subscription codes cleanup job is already running');
      return;
    }

    // Run every hour at minute 0 (e.g., 1:00, 2:00, 3:00...)
    cron.schedule('0 * * * *', async () => {
      try {
        await this.markExpiredCodes();
      } catch (error) {
        Logger.error('Failed to run subscription codes cleanup job', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.cleanupJobStarted = true;
    Logger.info('Subscription codes cleanup job started (runs every hour)');
  }

  /**
   * Mark expired subscription codes as expired
   */
  static async markExpiredCodes(): Promise<{
    markedExpired: number;
  }> {
    try {
      const now = new Date();

      // Find all active codes that have expired
      const expiredCodes = await db
        .select({ id: subscriptionCodes.id, code: subscriptionCodes.code })
        .from(subscriptionCodes)
        .where(
          and(
            eq(subscriptionCodes.state, 'active'),
            lt(subscriptionCodes.expiresAt, now),
            isNotNull(subscriptionCodes.expiresAt),
          ),
        );

      if (expiredCodes.length === 0) {
        return { markedExpired: 0 };
      }

      // Mark them as expired
      const expiredIds = expiredCodes.map((code) => code.id);
      await db
        .update(subscriptionCodes)
        .set({
          state: 'expired',
          searchVector: null, // Clear search vector for cleanup
        })
        .where(
          and(
            eq(subscriptionCodes.state, 'active'),
            lt(subscriptionCodes.expiresAt, now),
            isNotNull(subscriptionCodes.expiresAt),
          ),
        );

      Logger.info('Marked subscription codes as expired', {
        count: expiredCodes.length,
        codes: expiredCodes.map((c) => c.code),
      });

      return { markedExpired: expiredCodes.length };
    } catch (error) {
      Logger.error('Failed to mark expired subscription codes', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Manual cleanup method for testing or admin use
   */
  static async runCleanup(): Promise<{
    markedExpired: number;
    cleanedUpStats: boolean;
  }> {
    try {
      const result = await this.markExpiredCodes();

      // Also clean up any orphaned data or inconsistencies
      await this.validateConsistency();

      Logger.info('Manual cleanup completed', {
        markedExpired: result.markedExpired,
      });

      return {
        markedExpired: result.markedExpired,
        cleanedUpStats: true,
      };
    } catch (error) {
      Logger.error('Manual cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate and fix data consistency issues
   */
  private static async validateConsistency(): Promise<void> {
    try {
      // Fix redemption counts for codes where the count doesn't match the redeemed list
      const inconsistentCodes = await db
        .select()
        .from(subscriptionCodes)
        .where(ne(subscriptionCodes.oneTimeUse, true)); // Only check universal codes

      for (const code of inconsistentCodes) {
        if (code.redeemedBy) {
          try {
            const redeemedUsers = JSON.parse(code.redeemedBy);
            const actualCount = Array.isArray(redeemedUsers) ? redeemedUsers.length : 0;

            if (actualCount !== code.redemptionCount) {
              await db
                .update(subscriptionCodes)
                .set({ redemptionCount: actualCount })
                .where(eq(subscriptionCodes.id, code.id));

              Logger.info('Fixed redemption count inconsistency', {
                codeId: code.id,
                code: code.code,
                oldCount: code.redemptionCount,
                newCount: actualCount,
              });
            }
          } catch (parseError) {
            Logger.warn('Invalid redeemedBy JSON data found', {
              codeId: code.id,
              code: code.code,
              redeemedBy: code.redeemedBy,
            });
          }
        }
      }

      // Check for one-time codes that should be marked as used but aren't
      const oneTimeCodes = await db
        .select()
        .from(subscriptionCodes)
        .where(
          and(
            eq(subscriptionCodes.oneTimeUse, true),
            eq(subscriptionCodes.state, 'active'),
            ne(subscriptionCodes.redemptionCount, 0),
          ),
        );

      for (const code of oneTimeCodes) {
        if ((code.redemptionCount || 0) > 0) {
          await db
            .update(subscriptionCodes)
            .set({ state: 'used' })
            .where(eq(subscriptionCodes.id, code.id));

          Logger.info('Fixed one-time code state inconsistency', {
            codeId: code.id,
            code: code.code,
            redemptionCount: code.redemptionCount,
          });
        }
      }
    } catch (error) {
      Logger.error('Failed to validate consistency', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw here - consistency validation is non-critical
    }
  }

  /**
   * Get cleanup statistics
   */
  static async getCleanupStats(): Promise<{
    totalExpired: number;
    recentlyExpired: number; // Last 24 hours
    inconsistentCodes: number;
  }> {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalExpiredResult, recentlyExpiredResult, inconsistentCodesResult] =
        await Promise.all([
          // Total expired codes
          db
            .select({ count: subscriptionCodes.id })
            .from(subscriptionCodes)
            .where(eq(subscriptionCodes.state, 'expired')),

          // Recently expired codes (last 24 hours)
          db
            .select({ count: subscriptionCodes.id })
            .from(subscriptionCodes)
            .where(
              and(
                eq(subscriptionCodes.state, 'expired'),
                isNotNull(subscriptionCodes.expiresAt),
                lt(subscriptionCodes.expiresAt, now),
                gte(subscriptionCodes.expiresAt, yesterday),
              ),
            ),

          // Codes with potential inconsistencies
          db.select().from(subscriptionCodes).where(ne(subscriptionCodes.oneTimeUse, true)),
        ]);

      // Check for inconsistent universal codes
      let inconsistentCount = 0;
      for (const code of inconsistentCodesResult) {
        if (code.redeemedBy) {
          try {
            const redeemedUsers = JSON.parse(code.redeemedBy);
            const actualCount = Array.isArray(redeemedUsers) ? redeemedUsers.length : 0;
            if (actualCount !== code.redemptionCount) {
              inconsistentCount++;
            }
          } catch {
            inconsistentCount++;
          }
        }
      }

      return {
        totalExpired: totalExpiredResult.length,
        recentlyExpired: recentlyExpiredResult.length,
        inconsistentCodes: inconsistentCount,
      };
    } catch (error) {
      Logger.error('Failed to get cleanup stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        totalExpired: 0,
        recentlyExpired: 0,
        inconsistentCodes: 0,
      };
    }
  }
}
