import { db } from '../db/connection';
import { eq, and, desc, sql, count, isNull, lt, gt, inArray } from 'drizzle-orm';
import { subscriptionCodes, users } from '../db/schema';
import type { SubscriptionCode, NewSubscriptionCode } from '../db/schema/subscriptionCodes';
import {
  SubscriptionCodeCreationRequest,
  BulkSubscriptionCodeCreationRequest,
  SubscriptionCodeValidationResult,
  SubscriptionCodeStats,
} from '../types/subscriptionCodes';
import { SubscriptionService } from './subscriptionService';
import { UserService } from './userService';
import { Logger } from '../utils/logger';
import { NotificationService } from './notificationService';
import crypto from 'crypto';

export class SubscriptionCodesService {
  /**
   * Generate a random subscription code
   */
  private static generateCode(length = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate a unique subscription code (check for duplicates)
   */
  private static async generateUniqueCode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = this.generateCode();

      // Check if code already exists
      const existing = await db
        .select()
        .from(subscriptionCodes)
        .where(eq(subscriptionCodes.code, code))
        .limit(1);

      if (existing.length === 0) {
        return code;
      }

      attempts++;
    }

    throw new Error('Failed to generate unique code after multiple attempts');
  }

  /**
   * Create a single subscription code
   */
  static async createCode(
    createdBy: number,
    request: SubscriptionCodeCreationRequest,
  ): Promise<SubscriptionCode> {
    try {
      const code = await this.generateUniqueCode();
      const expiresAt = request.expiresAt ? new Date(request.expiresAt) : null;

      const [newCode] = await db
        .insert(subscriptionCodes)
        .values({
          code,
          timeValueDays: request.timeValueDays,
          expiresAt,
          oneTimeUse: request.oneTimeUse,
          eligibleUsers: request.eligibleUsers,
          maxRedemptions: request.maxRedemptions,
          specificUserIds: request.specificUserIds ? JSON.stringify(request.specificUserIds) : null,
          createdBy,
        })
        .returning();

      Logger.info('Subscription code created', {
        codeId: newCode.id,
        code: newCode.code,
        createdBy,
        timeValueDays: request.timeValueDays,
        eligibleUsers: request.eligibleUsers,
      });

      return newCode;
    } catch (error) {
      Logger.error('Failed to create subscription code', {
        createdBy,
        request,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create multiple subscription codes in bulk
   */
  static async createBulkCodes(
    createdBy: number,
    request: BulkSubscriptionCodeCreationRequest,
  ): Promise<SubscriptionCode[]> {
    try {
      const codes: NewSubscriptionCode[] = [];
      const expiresAt = request.expiresAt ? new Date(request.expiresAt) : null;

      // Generate unique codes
      for (let i = 0; i < request.count; i++) {
        const code = await this.generateUniqueCode();
        codes.push({
          code,
          timeValueDays: request.timeValueDays,
          expiresAt,
          oneTimeUse: request.oneTimeUse,
          eligibleUsers: request.eligibleUsers,
          maxRedemptions: request.maxRedemptions,
          specificUserIds: request.specificUserIds ? JSON.stringify(request.specificUserIds) : null,
          createdBy,
        });
      }

      const createdCodes = await db.insert(subscriptionCodes).values(codes).returning();

      Logger.info('Bulk subscription codes created', {
        count: createdCodes.length,
        createdBy,
        timeValueDays: request.timeValueDays,
        eligibleUsers: request.eligibleUsers,
      });

      return createdCodes;
    } catch (error) {
      Logger.error('Failed to create bulk subscription codes', {
        createdBy,
        request,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate a subscription code for redemption
   */
  static async validateCode(
    code: string,
    userId: number,
  ): Promise<SubscriptionCodeValidationResult> {
    try {
      // Find the code
      const codeResult = await db
        .select()
        .from(subscriptionCodes)
        .where(eq(subscriptionCodes.code, code.toUpperCase()))
        .limit(1);

      if (codeResult.length === 0) {
        return { valid: false, error: 'not_found' };
      }

      const subscriptionCode = codeResult[0];

      // Check if expired
      if (subscriptionCode.expiresAt && subscriptionCode.expiresAt < new Date()) {
        return { valid: false, error: 'expired' };
      }

      // Check if already used (for one-time codes)
      if (subscriptionCode.oneTimeUse && subscriptionCode.state === 'used') {
        return { valid: false, error: 'already_used' };
      }

      // Check if user already redeemed this code (for universal codes)
      if (!subscriptionCode.oneTimeUse && subscriptionCode.redeemedBy) {
        const redeemedUserIds = JSON.parse(subscriptionCode.redeemedBy || '[]');
        if (redeemedUserIds.includes(userId)) {
          return { valid: false, error: 'already_redeemed' };
        }
      }

      // Check maximum redemptions limit for universal codes
      if (!subscriptionCode.oneTimeUse && subscriptionCode.maxRedemptions) {
        const currentRedemptions = subscriptionCode.redemptionCount || 0;
        if (currentRedemptions >= subscriptionCode.maxRedemptions) {
          return { valid: false, error: 'max_redemptions_reached' };
        }
      }

      // Check specific user restrictions
      if (subscriptionCode.specificUserIds) {
        const allowedUserIds = JSON.parse(subscriptionCode.specificUserIds);
        if (!allowedUserIds.includes(userId)) {
          return { valid: false, error: 'user_not_allowed' };
        }
      }

      // Enhanced eligibility checks
      const user = await UserService.getUserById(userId);
      if (!user) {
        return { valid: false, error: 'not_eligible' };
      }

      const currentSubscription = await SubscriptionService.getCurrentSubscription(userId);
      const subscriptionHistory = await SubscriptionService.getUserSubscriptions(userId);

      switch (subscriptionCode.eligibleUsers) {
        case 'premium':
          // User must have subscription history (current or past)
          if (subscriptionHistory.length === 0) {
            return { valid: false, error: 'not_eligible' };
          }
          break;

        case 'active_subscribers':
          // User must currently have an active subscription
          if (!currentSubscription || currentSubscription.status !== 'active') {
            return { valid: false, error: 'not_eligible' };
          }
          break;

        case 'new_users':
          // User must not have any subscription history
          if (subscriptionHistory.length > 0) {
            return { valid: false, error: 'not_eligible' };
          }
          break;

        case 'all':
        default:
          // No additional restrictions
          break;
      }

      return {
        valid: true,
        code: {
          id: subscriptionCode.id,
          timeValueDays: subscriptionCode.timeValueDays,
          eligibleUsers: subscriptionCode.eligibleUsers,
          oneTimeUse: subscriptionCode.oneTimeUse,
          maxRedemptions: subscriptionCode.maxRedemptions || undefined,
          specificUserIds: subscriptionCode.specificUserIds
            ? JSON.parse(subscriptionCode.specificUserIds)
            : undefined,
        },
      };
    } catch (error) {
      Logger.error('Failed to validate subscription code', {
        code,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Redeem a subscription code
   */
  static async redeemCode(
    code: string,
    userId: number,
  ): Promise<{
    success: boolean;
    message: string;
    daysAdded?: number;
    newExpirationDate?: string;
  }> {
    try {
      // Validate the code first
      const validation = await this.validateCode(code, userId);
      if (!validation.valid || !validation.code) {
        const errorMessages = {
          not_found: 'Invalid redemption code',
          expired: 'This code has expired',
          already_used: 'This code has already been used',
          already_redeemed: 'You have already redeemed this code',
          not_eligible: 'You are not eligible to redeem this code',
          max_redemptions_reached: 'This code has reached its maximum number of redemptions',
          user_not_allowed: 'You are not authorized to redeem this code',
        };
        return {
          success: false,
          message: errorMessages[validation.error!] || 'Invalid code',
        };
      }

      const subscriptionCode = await db
        .select()
        .from(subscriptionCodes)
        .where(eq(subscriptionCodes.code, code.toUpperCase()))
        .limit(1);

      const codeData = subscriptionCode[0];

      // Extend user's subscription
      const result = await SubscriptionService.extendSubscriptionByDays(
        userId,
        codeData.timeValueDays,
      );

      // Update code status and redemption tracking
      if (codeData.oneTimeUse) {
        // Mark as used for one-time codes and update redemption count + redeemed user
        await db
          .update(subscriptionCodes)
          .set({
            state: 'used',
            redeemedBy: JSON.stringify([userId]), // Store the single user who redeemed it
            redemptionCount: (codeData.redemptionCount || 0) + 1,
          })
          .where(eq(subscriptionCodes.id, codeData.id));
      } else {
        // Add user to redeemed list for universal codes and update redemption count
        const redeemedUserIds = JSON.parse(codeData.redeemedBy || '[]');
        redeemedUserIds.push(userId);
        await db
          .update(subscriptionCodes)
          .set({
            redeemedBy: JSON.stringify(redeemedUserIds),
            redemptionCount: (codeData.redemptionCount || 0) + 1,
          })
          .where(eq(subscriptionCodes.id, codeData.id));
      }

      // Send notification
      const user = await UserService.getUserById(userId);
      if (user) {
        NotificationService.notifySubscriptionActivated(userId, 'MONTH', result.end_date).catch(
          (error: any) => {
            Logger.warn('Failed to send subscription extension notification', {
              userId,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );
      }

      Logger.info('Subscription code redeemed successfully', {
        code: codeData.code,
        userId,
        daysAdded: codeData.timeValueDays,
        newExpirationDate: result.end_date,
      });

      return {
        success: true,
        message: `Successfully added ${codeData.timeValueDays} days to your subscription!`,
        daysAdded: codeData.timeValueDays,
        newExpirationDate: result.end_date,
      };
    } catch (error) {
      Logger.error('Failed to redeem subscription code', {
        code,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        message: 'An error occurred while redeeming the code. Please try again.',
      };
    }
  }

  /**
   * Get all subscription codes (admin)
   */
  static async getAllCodes(): Promise<SubscriptionCode[]> {
    try {
      const codes = await db
        .select()
        .from(subscriptionCodes)
        .orderBy(desc(subscriptionCodes.createdAt));

      // Enhance codes with redeemer usernames
      const enhancedCodes = await Promise.all(
        codes.map(async (code) => {
          if (code.redeemedBy) {
            try {
              const redeemedUserIds = JSON.parse(code.redeemedBy);
              if (Array.isArray(redeemedUserIds) && redeemedUserIds.length > 0) {
                // Get usernames for redeemed users
                const redeemedUsers = await db
                  .select({
                    id: users.id,
                    username: users.username,
                  })
                  .from(users)
                  .where(inArray(users.id, redeemedUserIds));

                // Create a map for easy lookup
                const usernameMap = redeemedUsers.reduce(
                  (map: Record<number, string>, user: any) => {
                    map[user.id] = user.username;
                    return map;
                  },
                  {} as Record<number, string>,
                );

                // Add redeemer usernames to the code data
                return {
                  ...code,
                  redeemerUsernames: redeemedUserIds.map((id: number) => ({
                    id,
                    username: usernameMap[id] || `User #${id}`,
                  })),
                };
              }
            } catch (e) {
              // If parsing fails, just return the original code
            }
          }
          return code;
        }),
      );

      return enhancedCodes;
    } catch (error) {
      Logger.error('Failed to get all subscription codes', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get subscription codes created by a specific admin
   */
  static async getCodesByCreator(createdBy: number): Promise<SubscriptionCode[]> {
    try {
      return await db
        .select()
        .from(subscriptionCodes)
        .where(eq(subscriptionCodes.createdBy, createdBy))
        .orderBy(desc(subscriptionCodes.createdAt));
    } catch (error) {
      Logger.error('Failed to get codes by creator', {
        createdBy,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get subscription codes statistics
   */
  static async getStats(): Promise<SubscriptionCodeStats> {
    try {
      const [stats] = await db
        .select({
          total: count(),
          active: count(
            sql`CASE WHEN state = 'active' AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 END`,
          ),
          used: count(sql`CASE WHEN state = 'used' THEN 1 END`),
          expired: count(sql`CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END`),
          totalDaysGranted: sql<number>`SUM(time_value_days)`,
        })
        .from(subscriptionCodes);

      // Get unique redeemers count using a subquery approach
      const uniqueRedeemersResult = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count
        FROM (
          SELECT jsonb_array_elements_text(redeemed_by::jsonb)::int as user_id
          FROM subscription_codes
          WHERE redeemed_by IS NOT NULL AND redeemed_by != '[]' AND redeemed_by != 'null'
        ) as user_ids
      `);

      return {
        total: stats.total || 0,
        active: stats.active || 0,
        used: stats.used || 0,
        expired: stats.expired || 0,
        totalDaysGranted: stats.totalDaysGranted || 0,
        uniqueRedeemers: Number(uniqueRedeemersResult?.[0]?.count) || 0,
      };
    } catch (error) {
      Logger.error('Failed to get subscription codes stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cleanup expired codes (mark as expired)
   */
  static async cleanupExpiredCodes(): Promise<void> {
    try {
      await db
        .update(subscriptionCodes)
        .set({ state: 'expired' })
        .where(
          and(eq(subscriptionCodes.state, 'active'), lt(subscriptionCodes.expiresAt, new Date())),
        );

      Logger.info('Expired subscription codes cleanup completed');
    } catch (error) {
      Logger.error('Failed to cleanup expired subscription codes', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete a subscription code (admin)
   */
  static async deleteCode(codeId: number): Promise<void> {
    try {
      await db.delete(subscriptionCodes).where(eq(subscriptionCodes.id, codeId));
      Logger.info('Subscription code deleted', { codeId });
    } catch (error) {
      Logger.error('Failed to delete subscription code', {
        codeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
