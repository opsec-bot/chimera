#!/usr/bin/env ts-node
import { db, client } from '../db/connection';
import { Logger } from '../utils/logger';
import { users } from '../db/schema/users';
import { eq } from 'drizzle-orm';
import TOTPService from '../services/totpService';

async function testTotpFlow() {
  try {
    Logger.info('🧪 Testing TOTP flow...');

    // Find a test user (you can modify this to use your username)
    const testUsers = await db.select().from(users).limit(3);
    Logger.info('Available users:', {
      users: testUsers.map((u: any) => ({
        id: u.id,
        username: u.username,
        totpEnabled: u.totpEnabled,
      })),
    });

    if (testUsers.length === 0) {
      Logger.error('No users found in database');
      return;
    }

    const testUser = testUsers[0];
    Logger.info('Testing with user:', {
      id: testUser.id,
      username: testUser.username,
      totpEnabled: testUser.totpEnabled,
    });

    // Check if user has 2FA enabled
    const is2FAEnabled = await TOTPService.isTOTPEnabled(testUser.id);
    Logger.info('2FA Status:', { is2FAEnabled });

    if (!is2FAEnabled) {
      Logger.info(
        'To test 2FA login flow, you need to enable 2FA for this user first via the dashboard settings.',
      );
      Logger.info('The 2FA login flow will work as follows:');
      Logger.info('1. User enters username/password');
      Logger.info('2. If 2FA is enabled, backend returns { requireTotp: true }');
      Logger.info('3. Frontend shows TOTP input form');
      Logger.info('4. User enters 6-digit code or backup code');
      Logger.info('5. Backend verifies and completes login');
    } else {
      Logger.info('✅ User has 2FA enabled! Login flow should request TOTP code.');

      // Check backup codes availability
      const backupCodes = await TOTPService.getRemainingBackupCodes(testUser.id);
      Logger.info('Available backup codes:', { count: backupCodes });
    }

    Logger.info('🎉 TOTP flow test completed!');
  } catch (error) {
    Logger.error('❌ Test failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function main() {
  try {
    await testTotpFlow();
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
