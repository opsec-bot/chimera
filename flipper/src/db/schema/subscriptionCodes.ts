import { pgTable, serial, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptionCodes = pgTable(
  'subscription_codes',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    state: text('state', {
      enum: ['active', 'used', 'expired'],
    })
      .notNull()
      .default('active'),
    oneTimeUse: boolean('one_time_use').notNull().default(true),
    redeemedBy: text('redeemed_by'), // JSON array of user IDs for universal codes
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    expiresAt: timestamp('expires_at'), // null = never expires
    timeValueDays: integer('time_value_days').notNull(), // days to add to subscription
    eligibleUsers: text('eligible_users', {
      enum: ['all', 'premium', 'active_subscribers', 'new_users'],
    })
      .notNull()
      .default('all'),
    maxRedemptions: integer('max_redemptions'), // null = unlimited for universal codes
    redemptionCount: integer('redemption_count').notNull().default(0), // track current redemptions
    specificUserIds: text('specific_user_ids'), // JSON array of specific allowed user IDs
    searchVector: text('search_vector'), // for admin panel search functionality
  },
  (table) => ({
    codeIdx: index('subscription_codes_code_idx').on(table.code),
    stateIdx: index('subscription_codes_state_idx').on(table.state),
    createdByIdx: index('subscription_codes_created_by_idx').on(table.createdBy),
    expiresAtIdx: index('subscription_codes_expires_at_idx').on(table.expiresAt),
    eligibleUsersIdx: index('subscription_codes_eligible_users_idx').on(table.eligibleUsers),
  }),
);

export type SubscriptionCode = typeof subscriptionCodes.$inferSelect;
export type NewSubscriptionCode = typeof subscriptionCodes.$inferInsert;
