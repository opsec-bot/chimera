#!/usr/bin/env ts-node
import { db, client } from '../db/connection';
import { Logger } from '../utils/logger';
import { sql } from 'drizzle-orm';
import { users } from '../db/schema/users';

async function testSchema() {
  try {
    Logger.info('🧪 Testing 2FA schema...');

    // Test that we can query the users table with the new columns
    const result = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('totp_enabled', 'totp_secret')
      ORDER BY column_name
    `);

    Logger.info('📋 2FA columns in users table:', { columns: result });

    // Test that we can select from users table with new columns
    const userTest = await db
      .select({
        id: users.id,
        username: users.username,
        totpEnabled: users.totpEnabled,
        totpSecret: users.totpSecret,
      })
      .from(users)
      .limit(1);

    Logger.info('✅ Successfully queried users table with 2FA columns');
    Logger.info('🎉 Schema test completed successfully!');
  } catch (error) {
    Logger.error('❌ Schema test failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function main() {
  try {
    await testSchema();
    process.exit(0);
  } catch (error) {
    Logger.error('Test failed');
    process.exit(1);
  } finally {
    await client?.end();
  }
}

if (require.main === module) {
  main();
}
