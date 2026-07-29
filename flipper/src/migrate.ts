#!/usr/bin/env ts-node
import { runMigrations } from './db/connection';
import { Logger } from './utils/logger';

async function main() {
  try {
    Logger.info('🚀 Starting migration process...');
    await runMigrations();
    Logger.info('🎉 Migration process completed successfully!');
    process.exit(0);
  } catch (error) {
    Logger.error(
      '❌ Migration failed:',
      error instanceof Error ? { message: error.message, stack: error.stack } : { error },
    );
    process.exit(1);
  }
}

main();
