# Architecture Overview

This document provides a high-level overview of the Flipper application architecture, explaining the key components and how they interact.

## System Architecture

The Flipper application follows a **layered architecture** pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────┐
│                Frontend                      │
│            (React/TypeScript)               │
│                                            │
│  ┌─────────────┐  ┌─────────────┐         │
│  │  Components │  │    Pages    │         │
│  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────┘
                        │
                   HTTP/JSON API
                        │
┌─────────────────────────────────────────────┐
│                Backend                       │
│            (Node.js/Express)                │
│                                            │
│  ┌─────────────┐  ┌─────────────┐         │
│  │   Routes    │  │ Controllers │         │
│  └─────────────┘  └─────────────┘         │
│           │              │                │
│  ┌─────────────┐  ┌─────────────┐         │
│  │ Middleware  │  │  Services   │         │
│  └─────────────┘  └─────────────┘         │
│                        │                  │
│                 ┌─────────────┐            │
│                 │ Database    │            │
│                 │ (Drizzle)   │            │
│                 └─────────────┘            │
└─────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────┐
│              PostgreSQL                      │
│               Database                       │
└─────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend Layer (React/TypeScript)

**Location**: `/web/src/`

**Responsibilities**:

- User interface and user experience
- Client-side state management
- API communication
- Form validation and user input handling

**Key Technologies**:

- React 18 with TypeScript
- Vite for development and building
- shadcn/ui for UI components
- Tailwind CSS for styling

**Structure**:

```
web/src/
├── components/     # Reusable UI components
├── pages/         # Route-specific page components
├── hooks/         # Custom React hooks
├── lib/           # Utility functions and configurations
├── styles/        # Global styles and themes
└── types/         # TypeScript type definitions
```

### 2. Backend Layer (Node.js/Express)

**Location**: `/src/`

The backend follows a **service-oriented architecture** with clear separation between HTTP handling, business logic, and data access.

#### Routes Layer

**Location**: `/src/routes/`

**Responsibilities**:

- Define HTTP endpoints
- Route organization and grouping
- Route-level middleware application

```typescript
// Example: src/routes/auth.ts
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.getCurrentUser);
```

#### Controllers Layer

**Location**: `/src/controllers/`

**Responsibilities**:

- Handle HTTP requests and responses
- Input validation and sanitization
- Error handling and status codes
- Calling appropriate service methods

```typescript
// Example: src/controllers/authController.ts
export const authController = {
  login: async (req: Request, res: Response) => {
    // Validate input, call service, return response
  },
};
```

#### Services Layer

**Location**: `/src/services/`

**Responsibilities**:

- Business logic implementation
- Data transformation and processing
- Integration with external APIs
- Complex operations and workflows

```typescript
// Example: src/services/userService.ts
export class UserService {
  static async createUser(userData: NewUser): Promise<User> {
    // Business logic here
  }
}
```

#### Middleware Layer

**Location**: `/src/middleware/`

**Responsibilities**:

- Cross-cutting concerns (auth, logging, security)
- Request/response processing
- Error handling
- Rate limiting and security checks

### 3. Database Layer (Drizzle ORM)

**Location**: `/src/db/`

**Responsibilities**:

- Database schema definition
- Type-safe database operations
- Migration management
- Connection pooling and optimization

**Structure**:

```
src/db/
├── connection.ts   # Database connection setup
├── schema/         # Table schemas and types
│   ├── index.ts    # Schema exports
│   ├── users.ts    # User-related tables
│   └── ...         # Other domain tables
└── migrations/     # Database migration files
```

## Data Flow Architecture

### Request Processing Flow

```
1. HTTP Request → Routes
2. Routes → Middleware (Auth, Validation, etc.)
3. Middleware → Controllers
4. Controllers → Services (Business Logic)
5. Services → Database (via Drizzle ORM)
6. Database → Services (Data)
7. Services → Controllers (Processed Data)
8. Controllers → HTTP Response
```

### Example: User Login Flow

```typescript
// 1. Route Definition
router.post('/auth/login', authController.login);

// 2. Controller
export const authController = {
  login: async (req: Request, res: Response) => {
    try {
      // Validate input
      const { username, password } = loginSchema.parse(req.body);

      // Call service
      const result = await AuthService.authenticateUser(username, password);

      // Set session
      req.session.userId = result.user.id;

      // Return response
      res.json({ success: true, user: result.user });
    } catch (error) {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  },
};

// 3. Service
export class AuthService {
  static async authenticateUser(username: string, password: string) {
    // Get user from database
    const user = await UserService.findByUsername(username);

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await UserService.updateLastLogin(user.id);

    return { user };
  }
}

// 4. Database Service
export class UserService {
  static async findByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

    return user;
  }
}
```

## Security Architecture

### Authentication Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │    │  Database   │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │ POST /auth/login │                  │
       ├─────────────────►│                  │
       │                  │ Validate User    │
       │                  ├─────────────────►│
       │                  │                  │
       │                  │ User Data        │
       │                  │◄─────────────────┤
       │                  │                  │
       │    Set Session   │                  │
       │◄─────────────────┤                  │
       │                  │                  │
```

### Security Layers

1. **Input Validation**: Zod schemas validate all incoming data
2. **Authentication**: Session-based auth with optional 2FA
3. **Authorization**: Role-based access control (admin/user)
4. **CSRF Protection**: Cross-site request forgery prevention
5. **Rate Limiting**: Prevent abuse and brute force attacks
6. **SQL Injection Prevention**: Drizzle ORM parameterized queries

### Middleware Stack

```typescript
// Security middleware order (important!)
app.use(helmet()); // Security headers
app.use(rateLimit); // Rate limiting
app.use(csrf); // CSRF protection
app.use(sessionMiddleware); // Session management
app.use(authMiddleware); // Authentication
app.use(subscriptionMiddleware); // Subscription checks
```

## Subscription Architecture

### Subscription Management Flow

```
┌─────────────────────────────────────────────┐
│           Subscription System               │
│                                            │
│  ┌─────────────┐  ┌─────────────┐         │
│  │  Payment    │  │Subscription │         │
│  │  Service    │◄─┤  Service    │         │
│  └─────────────┘  └─────────────┘         │
│         │                 │               │
│  ┌─────────────┐  ┌─────────────┐         │
│  │   OxaPay    │  │ Notification│         │
│  │    API      │  │   Service   │         │
│  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────┘
```

### Subscription States

1. **No Subscription**: Limited access to features
2. **Active Subscription**: Full feature access
3. **Expired Subscription**: Grace period with notifications
4. **Renewed Subscription**: Automatic extension of access

## File Upload Architecture

### File Processing Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Upload    │    │  Processing │    │   Storage   │
│             │    │             │    │             │
│ ┌─────────┐ │    │ ┌─────────┐ │    │ ┌─────────┐ │
│ │Multer   │ │    │ │Validation│ │    │ │File     │ │
│ │Upload   │ ├───►│ │& Parsing │ ├───►│ │System   │ │
│ │         │ │    │ │         │ │    │ │         │ │
│ └─────────┘ │    │ └─────────┘ │    │ └─────────┘ │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
   Temporary           Processing            Permanent
    Storage             Queue               Storage
```

## External Services Integration

### Third-Party Services

1. **OxaPay**: Cryptocurrency payment processing
2. **Telegram**: Notification delivery
3. **File Storage**: Temporary and permanent file handling

### Integration Patterns

```typescript
// Service wrapper pattern for external APIs
export class PaymentService {
  static async processPayment(amount: number, currency: string) {
    try {
      // Call external payment API
      const response = await oxaPayAPI.createInvoice({
        amount,
        currency,
        callbackUrl: config.payment.callbackUrl,
      });

      // Store payment record
      await PaymentService.createPaymentRecord(response);

      return response;
    } catch (error) {
      Logger.error('Payment processing failed', { amount, currency, error });
      throw new Error('Payment processing failed');
    }
  }
}
```

## Development Workflow

### Local Development Setup

```bash
# 1. Database setup
docker-compose up -d postgres

# 2. Install dependencies
npm install
cd web && npm install

# 3. Run migrations
npm run db:migrate

# 4. Start development servers
npm run dev        # Backend
npm run web:dev    # Frontend
```

### Build and Deployment

```bash
# 1. Build frontend
cd web && npm run build

# 2. Build backend
npm run build

# 3. Deploy
npm start
```

## Monitoring and Logging

### Logging Architecture

```typescript
// Structured logging with Winston
Logger.info('User action completed', {
  userId: user.id,
  action: 'subscription_purchase',
  subscriptionType: 'MONTH',
  amount: 29.99,
  timestamp: new Date().toISOString(),
});
```

### Log Levels and Usage

- **Error**: System errors, failed operations, security events
- **Warn**: Non-critical issues, deprecated features, performance warnings
- **Info**: Business events, user actions, system status
- **Debug**: Detailed execution information (development only)

## Performance Considerations

### Database Optimization

1. **Indexes**: Strategic indexing for common queries
2. **Connection Pooling**: Efficient database connection management
3. **Query Optimization**: Selective column retrieval and proper joins
4. **Caching**: Application-level caching for frequently accessed data

### Application Performance

1. **Middleware Ordering**: Optimize middleware stack for performance
2. **Async Operations**: Non-blocking I/O operations
3. **Rate Limiting**: Prevent resource exhaustion
4. **Error Handling**: Graceful degradation and circuit breakers

## Scalability Patterns

### Horizontal Scaling Considerations

1. **Stateless Services**: Session management for multi-instance deployment
2. **Database Scaling**: Read replicas and connection pooling
3. **File Storage**: Distributed file storage solutions
4. **Load Balancing**: Request distribution across instances

This architecture provides a solid foundation for building and maintaining the Flipper application while ensuring scalability, security, and maintainability.
