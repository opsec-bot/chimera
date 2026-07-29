import { pgTable, serial, text, boolean, timestamp, integer, index } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    accessKey: text('access_key').notNull().unique(),
    isAdmin: boolean('is_admin').default(false),
    createdAt: timestamp('created_at').defaultNow(),
    lastLogin: timestamp('last_login'),
    ipAddress: text('ip_address'),
    invitedBy: integer('invited_by'),
    searchVector: text('search_vector'), // tsvector column for full-text search - handled by migration
    totpEnabled: boolean('totp_enabled').default(false), // Whether 2FA is enabled for this user
    totpSecret: text('totp_secret'), // Base32-encoded TOTP secret (encrypted)
  },
  (table) => ({
    // Regular indexes for now - we can add full-text search later
    usernameIdx: index('users_username_idx').on(table.username),
    ipAddressIdx: index('users_ip_address_idx').on(table.ipAddress),
    invitedByIdx: index('users_invited_by_idx').on(table.invitedBy),
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
