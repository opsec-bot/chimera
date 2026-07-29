import { db } from '../db/connection';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { subscriptions } from '../db/schema';
import { Subscription } from '../types/subscription';
import { calculateExpirationDate, SUBSCRIPTION_TIERS } from '../config/subscriptionConfig';
import { NotificationService } from './notificationService';
import { UserService } from './userService';
import Logger from '../utils/logger';

export class SubscriptionService {
  /**
   * Create a new subscription for a user
   */
  static async createSubscription(
    userId: number,
    type: 'WEEK' | 'MONTH' | 'THREE_MONTHS',
    paymentId?: string,
  ): Promise<Subscription> {
    try {
      // Check for existing active subscription first
      const existingSubscription = await this.getUserActiveSubscription(userId);
      let startDate: Date;

      if (existingSubscription) {
        // If there's an active subscription, extend from its end date
        startDate = new Date(existingSubscription.end_date);
      } else {
        // No active subscription, start immediately
        startDate = new Date();
      }

      const endDate = calculateExpirationDate(startDate, type);

      if (existingSubscription) {
        // Update the existing subscription's end date
        await db
          .update(subscriptions)
          .set({ endDate })
          .where(eq(subscriptions.id, existingSubscription.id));

        // Send notification
        NotificationService.notifySubscriptionActivated(userId, type, endDate.toISOString()).catch(
          (error) => {
            Logger.error('Failed to send subscription activation notification', {
              userId,
              subscriptionType: type,
              error: error.message,
            });
          },
        );

        // Grant free invite to subscriber if they don't have any invites
        UserService.getUserAvailableInviteCount(userId)
          .then((availableInvites) => {
            if (availableInvites === 0) {
              return UserService.createInvite(userId);
            }
          })
          .catch((error) => {
            Logger.error('Failed to grant invite to subscriber', {
              userId,
              subscriptionType: type,
              error: error instanceof Error ? error.message : String(error),
            });
          });

        // Return the updated subscription
        const [updatedSubscription] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, existingSubscription.id))
          .limit(1);

        return {
          id: updatedSubscription.id,
          user_id: updatedSubscription.userId,
          type: updatedSubscription.type,
          status: updatedSubscription.status,
          start_date: updatedSubscription.startDate.toISOString(),
          end_date: updatedSubscription.endDate.toISOString(),
          created_at: (updatedSubscription.createdAt || new Date()).toISOString(),
          payment_id: updatedSubscription.paymentId || undefined,
        };
      } else {
        // Create new subscription
        const [newSubscription] = await db
          .insert(subscriptions)
          .values({
            userId,
            type,
            status: 'active',
            startDate,
            endDate,
            paymentId,
          })
          .returning();

        // Send activation notification
        NotificationService.notifySubscriptionActivated(userId, type, endDate.toISOString()).catch(
          (error) => {
            Logger.error('Failed to send subscription activation notification', {
              userId,
              subscriptionType: type,
              error: error.message,
            });
          },
        );

        // Grant free invite to new subscriber if they don't have any invites
        UserService.getUserAvailableInviteCount(userId)
          .then((availableInvites) => {
            if (availableInvites === 0) {
              return UserService.createInvite(userId);
            }
          })
          .catch((error) => {
            Logger.error('Failed to grant invite to new subscriber', {
              userId,
              subscriptionType: type,
              error: error instanceof Error ? error.message : String(error),
            });
          });

        return {
          id: newSubscription.id,
          user_id: newSubscription.userId,
          type: newSubscription.type,
          status: newSubscription.status,
          start_date: newSubscription.startDate.toISOString(),
          end_date: newSubscription.endDate.toISOString(),
          created_at: (newSubscription.createdAt || new Date()).toISOString(),
          payment_id: newSubscription.paymentId || undefined,
        };
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user's active subscription
   */
  static async getUserActiveSubscription(userId: number): Promise<Subscription | null> {
    try {
      const activeSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, 'active'),
            sql`${subscriptions.endDate} > NOW()`,
          ),
        )
        .orderBy(desc(subscriptions.endDate))
        .limit(1);

      if (!activeSubscriptions[0]) return null;

      const subscription = activeSubscriptions[0];
      return {
        id: subscription.id,
        user_id: subscription.userId,
        type: subscription.type,
        status: subscription.status,
        start_date: subscription.startDate.toISOString(),
        end_date: subscription.endDate.toISOString(),
        created_at: (subscription.createdAt || new Date()).toISOString(),
        payment_id: subscription.paymentId || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if user has active subscription
   */
  static async hasActiveSubscription(userId: number): Promise<boolean> {
    const subscription = await this.getUserActiveSubscription(userId);
    return subscription !== null;
  }

  /**
   * Get all user subscriptions
   */
  static async getUserSubscriptions(userId: number): Promise<Subscription[]> {
    try {
      const userSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.createdAt));

      return userSubscriptions.map((subscription) => ({
        id: subscription.id,
        user_id: subscription.userId,
        type: subscription.type,
        status: subscription.status,
        start_date: subscription.startDate.toISOString(),
        end_date: subscription.endDate.toISOString(),
        created_at: (subscription.createdAt || new Date()).toISOString(),
        payment_id: subscription.paymentId || undefined,
      }));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the most recent subscription for a user (active or not)
   */
  static async getCurrentSubscription(userId: number): Promise<Subscription | null> {
    try {
      const currentSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(desc(subscriptions.endDate))
        .limit(1);

      if (!currentSubscriptions[0]) return null;

      const subscription = currentSubscriptions[0];
      return {
        id: subscription.id,
        user_id: subscription.userId,
        type: subscription.type,
        status: subscription.status,
        start_date: subscription.startDate.toISOString(),
        end_date: subscription.endDate.toISOString(),
        created_at: (subscription.createdAt || new Date()).toISOString(),
        payment_id: subscription.paymentId || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extend subscription (or create new if none exists)
   */
  static async extendSubscription(
    userId: number,
    subscriptionType: 'WEEK' | 'MONTH' | 'THREE_MONTHS',
  ): Promise<Subscription> {
    try {
      const tier = SUBSCRIPTION_TIERS.find((t) => t.type === subscriptionType);
      if (!tier) {
        throw new Error('Invalid subscription type');
      }

      const currentSub = await this.getCurrentSubscription(userId);
      let startDate: Date;
      let endDate: Date;

      if (currentSub && currentSub.status === 'active') {
        // Extend from current end date
        startDate = new Date(currentSub.end_date);
        endDate = new Date(startDate.getTime() + tier.duration_days * 24 * 60 * 60 * 1000);

        // Update current subscription
        await db.update(subscriptions).set({ endDate }).where(eq(subscriptions.id, currentSub.id));
      } else {
        // Create new subscription
        startDate = new Date();
        endDate = new Date(startDate.getTime() + tier.duration_days * 24 * 60 * 60 * 1000);

        await db.insert(subscriptions).values({
          userId,
          type: subscriptionType,
          status: 'active',
          startDate,
          endDate,
        });
      }

      // Get updated/created subscription
      const newSub = await this.getCurrentSubscription(userId);
      if (!newSub) {
        throw new Error('Failed to create/update subscription');
      }

      // Send subscription activation notification
      try {
        await NotificationService.notifySubscriptionActivated(
          userId,
          subscriptionType,
          endDate.toISOString(),
        );

        // Grant free invite to subscriber if they don't have any invites
        const availableInvites = await UserService.getUserAvailableInviteCount(userId);
        if (availableInvites === 0) {
          await UserService.createInvite(userId);
        }
      } catch (notificationError) {
        // Log but don't fail the subscription creation
        console.error('Failed to send subscription notification:', notificationError);
      }

      return newSub;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extend subscription by specific number of days
   */
  static async extendSubscriptionByDays(userId: number, days: number): Promise<Subscription> {
    try {
      const currentSub = await this.getCurrentSubscription(userId);
      let startDate: Date;
      let endDate: Date;

      if (currentSub && currentSub.status === 'active') {
        // Extend from current end date
        startDate = new Date(currentSub.end_date);
        endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

        // Update current subscription
        await db.update(subscriptions).set({ endDate }).where(eq(subscriptions.id, currentSub.id));
      } else {
        // Create new subscription starting now
        startDate = new Date();
        endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

        await db.insert(subscriptions).values({
          userId,
          type: 'MONTH', // Default type for code redemptions
          status: 'active',
          startDate,
          endDate,
        });
      }

      // Get updated/created subscription
      const newSub = await this.getCurrentSubscription(userId);
      if (!newSub) {
        throw new Error('Failed to create/update subscription');
      }

      Logger.info('Subscription extended by days', {
        userId,
        days,
        newEndDate: endDate.toISOString(),
      });

      return newSub;
    } catch (error) {
      Logger.error('Failed to extend subscription by days', {
        userId,
        days,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Expire old subscriptions (cleanup job)
   */
  static async expireOldSubscriptions(): Promise<number> {
    try {
      const result = await db
        .update(subscriptions)
        .set({ status: 'expired' })
        .where(and(eq(subscriptions.status, 'active'), sql`${subscriptions.endDate} <= NOW()`));

      // Note: Drizzle doesn't return rowCount, we'd need a separate count query
      // For now, return 1 to indicate success
      return 1;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get subscription statistics for admin
   */
  static async getSubscriptionStats(): Promise<any> {
    try {
      const stats = await db
        .select({
          type: subscriptions.type,
          status: subscriptions.status,
          count: count(),
          unique_users: count(sql`DISTINCT ${subscriptions.userId}`),
        })
        .from(subscriptions)
        .groupBy(subscriptions.type, subscriptions.status);

      const activeCount = await db
        .select({ total_active: count() })
        .from(subscriptions)
        .where(and(eq(subscriptions.status, 'active'), sql`${subscriptions.endDate} > NOW()`));

      return {
        byTypeAndStatus: stats,
        totalActive: activeCount[0]?.total_active || 0,
      };
    } catch (error) {
      throw error;
    }
  }
}
