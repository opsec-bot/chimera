#!/usr/bin/env ts-node
import { spawn } from 'child_process';
import { config } from 'dotenv';
import { Logger } from './utils/logger';

config();

async function setupDatabase() {
  Logger.info('🚀 Setting up database schema...');
  Logger.info('This will create/update all database tables automatically.');
  Logger.info('');

  return new Promise<void>((resolve, reject) => {
    const drizzleProcess = spawn('npx', ['drizzle-kit', 'push:pg'], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        // Force non-interactive mode by setting environment variables
        NODE_ENV: 'development',
      },
    });

    drizzleProcess.on('close', (code) => {
      if (code === 0) {
        Logger.info('');
        Logger.info('✅ Database schema setup completed successfully!');
        Logger.info('You can now run: npm run dev');
        resolve();
      } else {
        Logger.error('');
        Logger.error('❌ Database schema setup failed');
        Logger.error('Please check your DATABASE_URL and database connection');
        reject(new Error(`drizzle-kit process exited with code ${code}`));
      }
    });

    drizzleProcess.on('error', (error) => {
      Logger.error('❌ Failed to start drizzle-kit:', { message: error.message });
      reject(error);
    });
  });
}

async function main() {
  try {
    await setupDatabase();
    process.exit(0);
  } catch (error) {
    Logger.error('Setup failed:', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { setupDatabase };
