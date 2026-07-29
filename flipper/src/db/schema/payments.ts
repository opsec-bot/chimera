import { pgTable, serial, text, integer, timestamp, decimal, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { subscriptions } from './subscriptions';

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    subscriptionId: integer('subscription_id').references(() => subscriptions.id),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status', {
      enum: ['pending', 'paid', 'failed', 'expired'],
    })
      .notNull()
      .default('pending'),
    oxapayTrackId: text('oxapay_track_id').notNull().unique(),
    oxapayTxid: text('oxapay_txid'),
    paymentLink: text('payment_link').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    paymentType: text('payment_type', {
      enum: ['subscription', 'invite_purchase'],
    })
      .notNull()
      .default('subscription'),
    inviteCount: integer('invite_count'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    userIdIdx: index('payments_user_id_idx').on(table.userId),
    subscriptionIdIdx: index('payments_subscription_id_idx').on(table.subscriptionId),
    statusIdx: index('payments_status_idx').on(table.status),
    oxapayTrackIdIdx: index('payments_oxapay_track_id_idx').on(table.oxapayTrackId),
    paymentTypeIdx: index('payments_payment_type_idx').on(table.paymentType),
    createdAtIdx: index('payments_created_at_idx').on(table.createdAt),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
