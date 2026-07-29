# Coding Standards and Guidelines

This document outlines the coding standards and best practices for the Flipper application to ensure consistency, readability, and maintainability across the codebase.

## Table of Contents

1. [General Principles](#general-principles)
2. [TypeScript Standards](#typescript-standards)
3. [Database Operations](#database-operations)
4. [Service Layer](#service-layer)
5. [Controller Layer](#controller-layer)
6. [Middleware](#middleware)
7. [Error Handling](#error-handling)
8. [Logging](#logging)
9. [Authentication & Security](#authentication--security)
10. [Validation](#validation)
11. [File Structure](#file-structure)

## General Principles

### Code Style

- Use **TypeScript** for all new code
- Follow **ESLint** rules configured in the project
- Use **Prettier** for code formatting
- Use **camelCase** for variables and functions
- Use **PascalCase** for classes and types
- Use **SCREAMING_SNAKE_CASE** for constants

### Documentation

- All public functions and classes must have JSDoc comments
- Complex business logic must be commented
- Include parameter types and return types in JSDoc

```typescript
/**
 * Create a new subscription for a user
 * @param userId - The ID of the user
 * @param type - The subscription type (WEEK, MONTH, THREE_MONTHS)
 * @param paymentId - Optional payment reference ID
 * @returns Promise resolving to the created subscription
 */
static async createSubscription(
  userId: number,
  type: 'WEEK' | 'MONTH' | 'THREE_MONTHS',
  paymentId?: string,
): Promise<Subscription> {
  // Implementation
}
```

## TypeScript Standards

### Type Definitions

- Always define explicit types for function parameters and return values
- Use interfaces for object shapes
- Export types from appropriate schema files
- Use `type` for unions and primitives, `interface` for objects

```typescript
// Good - Explicit types
export interface CreateUserRequest {
  username: string;
  password: string;
  inviteCode?: string;
}

// Good - Exported from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Strict TypeScript

- No `any` types allowed (use `unknown` if necessary)
- All variables must be initialized or explicitly typed
- Use optional chaining (`?.`) and nullish coalescing (`??`) operators
- Enable strict mode in `tsconfig.json`

```typescript
// Good
const user = await UserService.findById(id);
const isAdmin = user?.isAdmin ?? false;

// Bad
let user: any = await UserService.findById(id);
if (user && user.isAdmin) {
  /* ... */
}
```

## Database Operations

### Schema Definition

- Use Drizzle ORM for all database operations
- Define schemas in `/src/db/schema/` directory
- Export types using `$inferSelect` and `$inferInsert`
- Use proper indexes for performance-critical queries

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
    usernameIdx: index('users_username_idx').on(table.username),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Query Patterns

- Use the connection from `/src/db/connection.ts`
- Import query builders from `drizzle-orm`
- Always handle database errors appropriately
- Use transactions for multi-step operations

```typescript
import { db } from '../db/connection';
import { eq, and, desc } from 'drizzle-orm';

// Good - Using query builder
const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

// Good - Using transactions
await db.transaction(async (tx) => {
  await tx.insert(users).values(newUser);
  await tx.insert(subscriptions).values(newSubscription);
});
```

## Service Layer

### Service Class Structure

- Use static methods for stateless operations
- Group related functionality in service classes
- Services handle business logic, not HTTP concerns
- Always return typed results

```typescript
export class SubscriptionService {
  /**
   * Create a new subscription for a user
   */
  static async createSubscription(
    userId: number,
    type: 'WEEK' | 'MONTH' | 'THREE_MONTHS',
    paymentId?: string,
  ): Promise<Subscription> {
    try {
      // Business logic here
      const startDate = new Date();
      const endDate = calculateExpirationDate(startDate, type);

      const [subscription] = await db
        .insert(subscriptions)
        .values({ userId, type, startDate, endDate, paymentId })
        .returning();

      return subscription;
    } catch (error) {
      Logger.error('Failed to create subscription', { userId, type, error });
      throw new Error('Failed to create subscription');
    }
  }
}
```

### Error Handling in Services

- Catch and log errors at the service level
- Throw meaningful error messages
- Use structured logging for debugging

```typescript
// Good
try {
  const result = await someOperation();
  return result;
} catch (error) {
  Logger.error('Operation failed', {
    operation: 'createUser',
    userId,
    error: error instanceof Error ? error.message : String(error),
  });
  throw new Error('Failed to create user');
}
```

## Controller Layer

### Controller Structure

- Export controllers as objects with methods
- Use proper TypeScript types for requests/responses
- Validate input using Zod schemas
- Handle HTTP-specific concerns (status codes, headers)

```typescript
export const walletsController = {
  /**
   * Handles uploading wallet data
   */
  uploadWalletsData: async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Validate input
      const validated = walletsDataSchema.parse(req.body.data);

      // Call service layer
      const result = await WalletService.processWalletData(validated);

      // Return HTTP response
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      Logger.error('Wallet upload failed', { error });
      res.status(500).json({ success: false, error: 'Upload failed' });
    }
  },
};
```

### Request/Response Patterns

- Use proper HTTP status codes
- Always return JSON with consistent structure
- Include success/error indicators
- Log important operations

```typescript
// Good - Consistent response structure
res.status(200).json({
  success: true,
  data: result,
  message: 'Operation completed successfully',
});

// Good - Error response
res.status(400).json({
  success: false,
  error: 'Invalid input data',
  details: validationErrors,
});
```

## Middleware

### Middleware Structure

- Use TypeScript for all middleware
- Extend Request types when adding properties
- Handle errors gracefully with proper logging
- Use consistent naming conventions

```typescript
// Extend Request type
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    isAdmin?: boolean;
  }
}

// Middleware implementation
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionUserId = req.session.userId;
    if (!sessionUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  } catch (error) {
    Logger.error('Auth middleware error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
};
```

### Path Exemptions

- Use arrays for path exemptions (maintainable)
- Create utility functions for path checking
- Document exemption reasons

```typescript
const SUBSCRIPTION_EXEMPT_PATH_PREFIXES = [
  '/auth/login',
  '/auth/register',
  '/subscription/purchase', // Allow purchasing without subscription
];

function isSubscriptionExemptPath(path: string): boolean {
  const p = path.toLowerCase();
  return SUBSCRIPTION_EXEMPT_PATH_PREFIXES.some((pref) => p === pref || p.startsWith(pref));
}
```

## Error Handling

### Error Patterns

- Always handle errors explicitly
- Use structured logging for errors
- Provide meaningful error messages to users
- Don't expose internal details to clients

```typescript
// Good - Proper error handling
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  Logger.error('Risky operation failed', {
    operation: 'userRegistration',
    userId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Don't expose internal details
  throw new Error('Registration failed. Please try again.');
}
```

### Error Response Format

- Use consistent error response structure
- Include appropriate HTTP status codes
- Provide actionable error messages

```typescript
// Good error response
res.status(400).json({
  success: false,
  error: 'Validation failed',
  details: {
    field: 'email',
    message: 'Email address is required',
  },
});
```

## Logging

### Logging Standards

- Use the Logger utility from `/src/utils/logger.ts`
- Include contextual information in logs
- Use appropriate log levels
- Structure log data for analysis

```typescript
import { Logger } from '../utils/logger';

// Good - Structured logging
Logger.info('User registration successful', {
  userId: user.id,
  username: user.username,
  invitedBy: inviteCode,
  duration: Date.now() - startTime,
});

Logger.error('Database operation failed', {
  operation: 'createSubscription',
  userId,
  error: error.message,
  query: 'INSERT INTO subscriptions...',
});
```

### Log Levels

- **error**: System errors, failed operations
- **warn**: Non-critical issues, deprecated usage
- **info**: Important business events
- **debug**: Detailed execution information (development only)

## Authentication & Security

### Authentication Flow

- Use session-based authentication
- Implement proper session management
- Support 2FA/TOTP authentication
- Validate all authentication states

```typescript
// Good - Session validation
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const sessionUserId = req.session.userId;

  if (!sessionUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify user still exists
  const user = await UserService.findById(sessionUserId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Invalid session' });
  }

  next();
};
```

### Security Best Practices

- Always validate input data
- Use parameterized queries (Drizzle handles this)
- Implement rate limiting
- Log security events
- Use CSRF protection

## Validation

### Input Validation

- Use Zod for all input validation
- Define schemas close to where they're used
- Provide clear validation error messages
- Validate at the controller level

```typescript
import { z } from 'zod';

const walletsDataSchema = z.object({
  xe_wallet: z.string().min(1, 'Wallet address is required'),
  xe_mnemonic: z.string().min(1, 'Mnemonic is required'),
});

// Usage in controller
try {
  const validated = walletsDataSchema.parse(req.body.data);
} catch (error) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.errors,
    });
  }
  throw error;
}
```

## File Structure

### Directory Organization

```
src/
├── config/          # Configuration files
├── controllers/     # HTTP request handlers
├── db/             # Database configuration and schemas
│   └── schema/     # Drizzle schema definitions
├── middleware/     # Express middleware
├── models/         # Data models (if needed beyond schemas)
├── routes/         # Route definitions
├── services/       # Business logic layer
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

### Naming Conventions

- **Files**: camelCase (e.g., `userService.ts`)
- **Directories**: camelCase (e.g., `middleware/`)
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions**: camelCase (e.g., `createUser`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_LOGIN_ATTEMPTS`)

### Import/Export Patterns

- Use named exports for utilities and services
- Use default exports sparingly
- Group imports: external libraries, internal modules, types
- Use absolute imports from `src/`

```typescript
// Good import order
import { Request, Response } from 'express';
import { z } from 'zod';

import { UserService } from '../services/userService';
import { Logger } from '../utils/logger';
import type { AuthenticatedRequest } from '../middleware/auth';
```

## Conclusion

These standards ensure that our codebase remains maintainable, secure, and consistent. All developers should follow these guidelines when contributing to the project. When in doubt, refer to existing code patterns in the codebase or ask for clarification during code reviews.
