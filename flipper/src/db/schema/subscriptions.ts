import { pgTable, serial, text, integer, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type', {
      enum: ['WEEK', 'MONTH', 'THREE_MONTHS'],
    }).notNull(),
    status: text('status', {
      enum: ['active', 'expired', 'pending'],
    })
      .notNull()
      .default('active'),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    paymentId: text('payment_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
    statusIdx: index('subscriptions_status_idx').on(table.status),
    endDateIdx: index('subscriptions_end_date_idx').on(table.endDate),
    typeIdx: index('subscriptions_type_idx').on(table.type),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
