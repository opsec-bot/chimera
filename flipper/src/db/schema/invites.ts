import { pgTable, serial, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const invites = pgTable(
  'invites',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    usedBy: integer('used_by').references(() => users.id),
    subscriptionDays: integer('subscription_days'),
    subscriptionType: text('subscription_type', {
      enum: ['WEEK', 'MONTH', 'THREE_MONTHS'],
    }),
    isPremium: boolean('is_premium').default(false),
    targetUserId: integer('target_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    usedAt: timestamp('used_at'),
    isActive: boolean('is_active').default(true),
    searchVector: text('search_vector'), // tsvector column for full-text search - handled by migration
  },
  (table) => ({
    codeIdx: index('invites_code_idx').on(table.code),
    createdByIdx: index('invites_created_by_idx').on(table.createdBy),
    usedByIdx: index('invites_used_by_idx').on(table.usedBy),
    targetUserIdIdx: index('invites_target_user_id_idx').on(table.targetUserId),
    isActiveIdx: index('invites_is_active_idx').on(table.isActive),
  }),
);

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
