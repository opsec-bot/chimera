# Database Guide

This guide explains how to work with the database in the Flipper application using Drizzle ORM.

## Overview

The application uses **PostgreSQL** with **Drizzle ORM** for type-safe database operations. All database schemas are defined in TypeScript and provide full type safety.

## Database Configuration

### Connection Setup

The database connection is configured in `src/db/connection.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/config';

const client = postgres(config.database.url);
export const db = drizzle(client);
```

### Environment Variables

Set the following environment variables:

```bash
DATABASE_URL=postgresql://username:password@localhost:5432/flipper_db
```

## Schema Definition

### Schema Structure

Schemas are organized in `src/db/schema/` directory:

```
src/db/schema/
├── index.ts           # Exports all schemas
├── users.ts           # User accounts
├── subscriptions.ts   # User subscriptions
├── payments.ts        # Payment records
├── submissions.ts     # Data submissions
└── ...
```

### Creating a New Schema

1. **Create the schema file** in `src/db/schema/newTable.ts`:

```typescript
import { pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const newTable = pgTable('new_table', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// Export types for TypeScript
export type NewTableType = typeof newTable.$inferSelect;
export type NewTableInsert = typeof newTable.$inferInsert;
```

2. **Add to index.ts**:

```typescript
export * from './newTable';
```

3. **Create migration**:

```bash
npm run db:generate
npm run db:migrate
```

### Schema Best Practices

- **Use descriptive names** for tables and columns
- **Add indexes** for frequently queried columns
- **Use proper data types** (text, integer, boolean, timestamp)
- **Export TypeScript types** using `$inferSelect` and `$inferInsert`
- **Add constraints** where appropriate (unique, notNull, default)

```typescript
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    // Add indexes for performance
    usernameIdx: index('users_username_idx').on(table.username),
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
  }),
);
```

## Query Operations

### Basic Operations

#### Select Operations

```typescript
import { db } from '../db/connection';
import { users } from '../db/schema';
import { eq, and, or, desc, asc } from 'drizzle-orm';

// Select all users
const allUsers = await db.select().from(users);

// Select specific user by ID
const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

// Select with multiple conditions
const activeAdmins = await db
  .select()
  .from(users)
  .where(and(eq(users.isAdmin, true), eq(users.isActive, true)));

// Select with ordering and pagination
const recentUsers = await db
  .select()
  .from(users)
  .orderBy(desc(users.createdAt))
  .limit(10)
  .offset(20);
```

#### Insert Operations

```typescript
// Insert single record
const [newUser] = await db
  .insert(users)
  .values({
    username: 'john_doe',
    passwordHash: 'hashed_password',
    isAdmin: false,
  })
  .returning();

// Insert multiple records
const newUsers = await db
  .insert(users)
  .values([
    { username: 'user1', passwordHash: 'hash1' },
    { username: 'user2', passwordHash: 'hash2' },
  ])
  .returning();
```

#### Update Operations

```typescript
// Update single field
await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, userId));

// Update multiple fields
await db
  .update(users)
  .set({
    username: 'new_username',
    isActive: true,
  })
  .where(eq(users.id, userId));

// Update with returning
const [updatedUser] = await db
  .update(users)
  .set({ isAdmin: true })
  .where(eq(users.id, userId))
  .returning();
```

#### Delete Operations

```typescript
// Soft delete (recommended)
await db.update(users).set({ isActive: false, deletedAt: new Date() }).where(eq(users.id, userId));

// Hard delete (use with caution)
await db.delete(users).where(eq(users.id, userId));
```

### Advanced Queries

#### Joins

```typescript
import { users, subscriptions } from '../db/schema';

// Inner join
const usersWithSubscriptions = await db
  .select({
    userId: users.id,
    username: users.username,
    subscriptionType: subscriptions.type,
    expiresAt: subscriptions.endDate,
  })
  .from(users)
  .innerJoin(subscriptions, eq(users.id, subscriptions.userId))
  .where(eq(subscriptions.isActive, true));

// Left join
const allUsersWithSubscriptions = await db
  .select()
  .from(users)
  .leftJoin(subscriptions, eq(users.id, subscriptions.userId));
```

#### Aggregations

```typescript
import { count, sum, avg } from 'drizzle-orm';

// Count records
const userCount = await db.select({ count: count() }).from(users);

// Group by with aggregation
const subscriptionStats = await db
  .select({
    type: subscriptions.type,
    count: count(),
    totalRevenue: sum(payments.amount),
  })
  .from(subscriptions)
  .leftJoin(payments, eq(subscriptions.paymentId, payments.id))
  .groupBy(subscriptions.type);
```

#### Subqueries

```typescript
// Using subqueries
const recentlyActiveUsers = await db
  .select()
  .from(users)
  .where(
    eq(
      users.id,
      db
        .select({ userId: submissions.userId })
        .from(submissions)
        .where(gte(submissions.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))),
    ),
  );
```

## Transactions

### Basic Transactions

```typescript
import { db } from '../db/connection';

// Transaction with automatic rollback on error
const result = await db.transaction(async (tx) => {
  // All operations use 'tx' instead of 'db'
  const [user] = await tx.insert(users).values({ username, passwordHash }).returning();

  const [subscription] = await tx
    .insert(subscriptions)
    .values({ userId: user.id, type: 'MONTH' })
    .returning();

  return { user, subscription };
});
```

### Advanced Transaction Patterns

```typescript
// Transaction with explicit error handling
try {
  await db.transaction(async (tx) => {
    // Step 1: Update user
    await tx.update(users).set({ lastLogin: new Date() }).where(eq(users.id, userId));

    // Step 2: Create audit log
    await tx.insert(auditLogs).values({
      userId,
      action: 'LOGIN',
      timestamp: new Date(),
    });

    // Step 3: Update statistics
    await tx
      .update(userStats)
      .set({ loginCount: sql`${userStats.loginCount} + 1` })
      .where(eq(userStats.userId, userId));
  });
} catch (error) {
  Logger.error('Login transaction failed', { userId, error });
  throw new Error('Failed to process login');
}
```

## Database Migrations

### Creating Migrations

1. **Modify schema files** in `src/db/schema/`

2. **Generate migration**:

```bash
npm run db:generate
```

3. **Review generated SQL** in `drizzle/` directory

4. **Apply migration**:

```bash
npm run db:migrate
```

### Migration Best Practices

- **Always backup** before running migrations in production
- **Test migrations** on staging environment first
- **Review generated SQL** before applying
- **Add indexes** in separate migrations for large tables
- **Use transactions** for complex migrations

### Example Migration Workflow

```bash
# 1. Modify schema
# Edit src/db/schema/users.ts

# 2. Generate migration
npm run db:generate

# 3. Review migration file
cat drizzle/0001_migration.sql

# 4. Apply to development
npm run db:migrate

# 5. Test application
npm run dev

# 6. Apply to production
NODE_ENV=production npm run db:migrate
```

## Performance Optimization

### Indexing Strategy

```typescript
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow(),
    lastActive: timestamp('last_active'),
  },
  (table) => ({
    // Primary access patterns
    emailIdx: index('users_email_idx').on(table.email),

    // Query optimization
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
    lastActiveIdx: index('users_last_active_idx').on(table.lastActive),

    // Composite index for common query
    activeUsersIdx: index('users_active_created_idx').on(table.lastActive, table.createdAt),
  }),
);
```

### Query Optimization

```typescript
// Good - Use specific columns
const users = await db
  .select({
    id: users.id,
    username: users.username,
  })
  .from(users)
  .limit(100);

// Bad - Select all columns when not needed
const users = await db.select().from(users);

// Good - Use pagination
const paginatedUsers = await db
  .select()
  .from(users)
  .orderBy(users.createdAt)
  .limit(20)
  .offset(page * 20);

// Good - Use proper WHERE conditions
const recentUsers = await db
  .select()
  .from(users)
  .where(gte(users.createdAt, new Date('2024-01-01')));
```

### Connection Management

```typescript
// Good - Reuse connection
import { db } from '../db/connection';

export class UserService {
  static async findById(id: number) {
    return db.select().from(users).where(eq(users.id, id));
  }
}

// Bad - Create new connection each time
export class UserService {
  static async findById(id: number) {
    const newDb = drizzle(postgres(connectionString));
    return newDb.select().from(users).where(eq(users.id, id));
  }
}
```

## Error Handling

### Database Error Patterns

```typescript
import { DatabaseError } from 'pg';

export class UserService {
  static async createUser(userData: NewUser) {
    try {
      const [user] = await db.insert(users).values(userData).returning();

      return user;
    } catch (error) {
      // Handle specific database errors
      if (error instanceof DatabaseError) {
        if (error.code === '23505') {
          // Unique violation
          throw new Error('Username already exists');
        }
        if (error.code === '23503') {
          // Foreign key violation
          throw new Error('Invalid reference data');
        }
      }

      Logger.error('Database error in createUser', {
        userData: { username: userData.username }, // Don't log passwords
        error: error.message,
      });

      throw new Error('Failed to create user');
    }
  }
}
```

## Security Considerations

### Query Safety

```typescript
// Good - Parameterized queries (Drizzle handles this)
const user = await db.select().from(users).where(eq(users.username, userInput)); // Safe

// Bad - String concatenation (avoid raw SQL)
const result = await db.execute(
  sql`SELECT * FROM users WHERE username = ${userInput}`, // Potential injection
);
```

### Data Sanitization

```typescript
// Good - Validate before database operations
const userData = userSchema.parse(input); // Zod validation
const [user] = await db.insert(users).values(userData).returning();

// Good - Hash sensitive data before storing
const passwordHash = await bcrypt.hash(password, 12);
const [user] = await db.insert(users).values({ username, passwordHash }).returning();
```

### Access Control

```typescript
// Good - Check permissions before database operations
export class UserService {
  static async updateUser(currentUserId: number, targetUserId: number, updates: Partial<User>) {
    // Check if user can update target
    if (currentUserId !== targetUserId) {
      const currentUser = await this.findById(currentUserId);
      if (!currentUser?.isAdmin) {
        throw new Error('Insufficient permissions');
      }
    }

    // Proceed with update
    return db.update(users).set(updates).where(eq(users.id, targetUserId)).returning();
  }
}
```

## Testing Database Operations

### Test Setup

```typescript
// Setup test database
beforeAll(async () => {
  await db.execute(sql`CREATE DATABASE test_flipper`);
  await migrate(db, { migrationsFolder: './drizzle' });
});

// Clean up between tests
afterEach(async () => {
  await db.delete(users);
  await db.delete(subscriptions);
});
```

### Test Patterns

```typescript
describe('UserService', () => {
  test('should create user successfully', async () => {
    const userData = {
      username: 'testuser',
      passwordHash: 'hashed_password',
    };

    const user = await UserService.createUser(userData);

    expect(user.username).toBe('testuser');
    expect(user.id).toBeDefined();
  });

  test('should handle duplicate username', async () => {
    const userData = { username: 'duplicate', passwordHash: 'hash' };

    await UserService.createUser(userData);

    await expect(UserService.createUser(userData)).rejects.toThrow('Username already exists');
  });
});
```

## Troubleshooting

### Common Issues

1. **Connection Issues**

   - Check DATABASE_URL environment variable
   - Verify PostgreSQL is running
   - Check network connectivity

2. **Migration Failures**

   - Review generated SQL for syntax errors
   - Check for conflicting schema changes
   - Verify database permissions

3. **Query Performance**

   - Add appropriate indexes
   - Use EXPLAIN to analyze query plans
   - Optimize WHERE clauses
   - Consider pagination for large result sets

4. **Type Errors**
   - Regenerate schema types after changes
   - Check import statements
   - Verify schema exports

### Debugging Queries

```typescript
// Enable query logging in development
import { drizzle } from 'drizzle-orm/postgres-js';

const db = drizzle(client, {
  logger: process.env.NODE_ENV === 'development',
});

// Or use custom logger
const db = drizzle(client, {
  logger: {
    logQuery: (query, params) => {
      console.log('Query:', query);
      console.log('Params:', params);
    },
  },
});
```

This guide should help you work effectively with the database layer in the Flipper application. Always follow the established patterns and prioritize type safety and performance.
