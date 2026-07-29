#!/usr/bin/env ts-node
import { db, client } from '../db/connection';
import { Logger } from '../utils/logger';
import { sql } from 'drizzle-orm';

async function add2FAColumns() {
  try {
    Logger.info('🔧 Adding 2FA columns to users table...');

    // Add totp_enabled column if it doesn't exist
    try {
      await db.execute(sql`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false
      `);
      Logger.info('✅ Added totp_enabled column');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        Logger.info('ℹ️ totp_enabled column already exists');
      } else {
        throw e;
      }
    }

    // Add totp_secret column if it doesn't exist
    try {
      await db.execute(sql`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT DEFAULT NULL
      `);
      Logger.info('✅ Added totp_secret column');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        Logger.info('ℹ️ totp_secret column already exists');
      } else {
        throw e;
      }
    }

    // Create backup_codes table
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS backup_codes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          used_at TIMESTAMP DEFAULT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      Logger.info('✅ Created backup_codes table');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        Logger.info('ℹ️ backup_codes table already exists');
      } else {
        throw e;
      }
    }

    // Add indexes
    try {
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS backup_codes_user_id_idx ON backup_codes(user_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS backup_codes_unused_idx ON backup_codes(user_id, used_at) WHERE used_at IS NULL
      `);
      Logger.info('✅ Added backup_codes indexes');
    } catch (e: any) {
      Logger.warn('Index creation warning (may already exist):', e.message);
    }

    Logger.info('🎉 2FA schema setup completed successfully!');
  } catch (error) {
    Logger.error('❌ Failed to add 2FA columns:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function main() {
  try {
    await add2FAColumns();
    process.exit(0);
  } catch (error) {
    Logger.error('Migration failed');
    process.exit(1);
  } finally {
    await client?.end();
  }
}

if (require.main === module) {
  main();
}

export { add2FAColumns };
