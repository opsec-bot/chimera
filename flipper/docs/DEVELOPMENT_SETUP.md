# Development Setup Guide

This guide will help you set up the development environment for the Flipper application.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **PostgreSQL** (v14 or higher)
- **Git**
- **Docker** (optional, for database)

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/flipper.git
cd flipper
```

### 2. Environment Variables

Create environment files for different environments:

#### `.env.development`

```bash
# Database
DATABASE_URL=postgresql://flipper_user:password@localhost:5432/flipper_dev

# Server
NODE_ENV=development
PORT=3000
HOST=localhost

# Session
SESSION_SECRET=your-development-secret-key-here
SESSION_NAME=flipper_session

# Security
CSRF_SECRET=your-csrf-secret-here
ENCRYPTION_KEY=your-32-char-encryption-key-here

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./temp/uploads

# External Services
OXAPAY_API_KEY=your-oxapay-api-key
OXAPAY_WEBHOOK_SECRET=your-webhook-secret

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Logging
LOG_LEVEL=debug
LOG_FILE=./logs/development.log
```

#### `.env.production`

```bash
# Database
DATABASE_URL=postgresql://user:password@prod-host:5432/flipper_prod

# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Session (use strong secrets in production)
SESSION_SECRET=your-super-secure-session-secret
SESSION_NAME=flipper_session

# Security
CSRF_SECRET=your-super-secure-csrf-secret
ENCRYPTION_KEY=your-32-char-production-encryption-key

# External Services
OXAPAY_API_KEY=your-production-oxapay-key
OXAPAY_WEBHOOK_SECRET=your-production-webhook-secret

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/production.log
```

### 3. Database Setup

#### Option A: Local PostgreSQL

Install and start PostgreSQL, then create the database:

```sql
CREATE DATABASE flipper_dev;
CREATE USER flipper_user WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE flipper_dev TO flipper_user;
```

#### Option B: Docker PostgreSQL

```bash
# Start PostgreSQL container
docker run --name flipper-postgres \
  -e POSTGRES_DB=flipper_dev \
  -e POSTGRES_USER=flipper_user \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:14

# Or use docker-compose (if available)
docker-compose up -d postgres
```

### 4. Install Dependencies

Install backend dependencies:

```bash
npm install
```

Install frontend dependencies:

```bash
cd web
npm install
cd ..
```

### 5. Database Migration

Run database migrations to set up the schema:

```bash
# Generate migration files (if schema changed)
npm run db:generate

# Apply migrations
npm run db:migrate

# Optional: Seed development data
npm run db:seed
```

### 6. Build Frontend

Build the frontend application:

```bash
cd web
npm run build
cd ..
```

## Development Workflow

### Starting Development Servers

#### Backend Development

```bash
# Start backend with hot reload
npm run dev

# Or with specific environment
NODE_ENV=development npm run dev
```

The backend will start on `http://localhost:3000`

#### Frontend Development

```bash
# In a separate terminal
cd web
npm run dev
```

The frontend development server will start on `http://localhost:5173`

#### Full Stack Development

```bash
# Start both backend and frontend (if configured)
npm run dev:all
```

### Available Scripts

#### Backend Scripts

```bash
# Development
npm run dev          # Start with nodemon
npm run build        # Build TypeScript
npm run start        # Start production build

# Database
npm run db:generate  # Generate migration
npm run db:migrate   # Apply migrations
npm run db:drop      # Drop database (careful!)
npm run db:seed      # Seed development data

# Code Quality
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
npm run format       # Format with Prettier
npm run type-check   # TypeScript type checking

# Testing
npm test            # Run tests
npm run test:watch  # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

#### Frontend Scripts

```bash
cd web

# Development
npm run dev         # Start dev server
npm run build       # Build for production
npm run preview     # Preview production build

# Code Quality
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues
npm run type-check  # TypeScript checking
```

## IDE Configuration

### VS Code (Recommended)

Install the following extensions:

1. **ESLint** - Code linting
2. **Prettier** - Code formatting
3. **TypeScript Importer** - Auto imports
4. **Thunder Client** - API testing
5. **PostgreSQL** - Database management

#### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.env": true
  }
}
```

#### VS Code Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/server.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "envFile": "${workspaceFolder}/.env.development",
      "runtimeArgs": ["-r", "ts-node/register"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Testing Setup

### Backend Testing

```bash
# Install test dependencies (should already be installed)
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode during development
npm run test:watch
```

### Test Database Setup

Create a separate test database:

```sql
CREATE DATABASE flipper_test;
GRANT ALL PRIVILEGES ON DATABASE flipper_test TO flipper_user;
```

Add to `.env.test`:

```bash
DATABASE_URL=postgresql://flipper_user:password@localhost:5432/flipper_test
NODE_ENV=test
```

### Frontend Testing

```bash
cd web

# Install test dependencies (if not already installed)
npm install --save-dev @testing-library/react @testing-library/jest-dom vitest

# Run tests
npm run test

# Run with UI
npm run test:ui
```

## Database Management

### Migration Workflow

```bash
# 1. Modify schema files in src/db/schema/
# 2. Generate migration
npm run db:generate

# 3. Review generated SQL in drizzle/ folder
cat drizzle/0001_migration.sql

# 4. Apply migration
npm run db:migrate

# 5. Verify schema changes
npm run db:studio  # Opens Drizzle Studio (if configured)
```

### Database Backup and Restore

```bash
# Backup
pg_dump -h localhost -U flipper_user -d flipper_dev > backup.sql

# Restore
psql -h localhost -U flipper_user -d flipper_dev < backup.sql
```

## Debugging

### Backend Debugging

#### Using VS Code Debugger

1. Set breakpoints in your TypeScript files
2. Press F5 or use "Debug Backend" configuration
3. The debugger will attach and stop at breakpoints

#### Using Node.js Inspector

```bash
# Start with inspector
npm run dev:debug

# Open Chrome and go to chrome://inspect
# Click "Open dedicated DevTools for Node"
```

### Frontend Debugging

#### Browser DevTools

1. Open browser DevTools (F12)
2. Use React Developer Tools extension
3. Set breakpoints in Sources tab

#### VS Code Debugging

Install "Debugger for Chrome" extension and add configuration:

```json
{
  "name": "Debug Frontend",
  "type": "chrome",
  "request": "launch",
  "url": "http://localhost:5173",
  "webRoot": "${workspaceFolder}/web/src"
}
```

## Performance Monitoring

### Development Monitoring

```bash
# Monitor backend performance
npm run dev -- --inspect

# Monitor frontend bundle size
cd web
npm run analyze
```

### Logging Configuration

Logs are configured in `src/utils/logger.ts`. In development:

- Console logging is enabled
- Log level is set to 'debug'
- File logging is optional

### Database Query Monitoring

Enable query logging in development:

```typescript
// In src/db/connection.ts
const db = drizzle(client, {
  logger: process.env.NODE_ENV === 'development',
});
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -h localhost -U flipper_user -d flipper_dev
```

#### TypeScript Errors

```bash
# Clear TypeScript cache
rm -rf node_modules/.cache
npm run type-check
```

#### Module Resolution Issues

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Environment Issues

#### Wrong Node Version

```bash
# Check version
node --version

# Use nvm to switch
nvm use 18
```

#### Missing Environment Variables

```bash
# Check if .env file exists
ls -la .env*

# Verify variables are loaded
node -e "console.log(process.env.DATABASE_URL)"
```

## Production Deployment

### Build Process

```bash
# Build frontend
cd web
npm run build
cd ..

# Build backend
npm run build

# Start production server
npm start
```

### Environment Setup

1. Set up production database
2. Configure environment variables
3. Set up reverse proxy (nginx)
4. Configure SSL certificates
5. Set up monitoring and logging

### Health Checks

The application includes health check endpoints:

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system status

## Additional Resources

### Documentation

- [Coding Standards](./CODING_STANDARDS.md)
- [Database Guide](./DATABASE_GUIDE.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [API Documentation](./API_DOCUMENTATION.md)

### External Documentation

- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Express.js Guide](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

This setup guide should get you up and running with the Flipper development environment. If you encounter any issues, check the troubleshooting section or reach out to the development team.
