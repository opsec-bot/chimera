# Flipper Application Documentation

This directory contains comprehensive documentation for the Flipper application development and usage.

## 📚 Documentation Index

### Core Development Guides

#### [📋 Coding Standards](./CODING_STANDARDS.md)

Complete coding standards and best practices for maintaining consistency across the codebase:

- TypeScript standards and type safety
- Service layer patterns and error handling
- Controller and middleware implementation
- Database operations and validation
- Security and authentication patterns

#### [🗄️ Database Guide](./DATABASE_GUIDE.md)

Comprehensive guide for working with the PostgreSQL database using Drizzle ORM:

- Schema definition and migrations
- Query patterns and optimization
- Transaction management
- Performance considerations
- Testing and debugging

#### [🏗️ Architecture Overview](./ARCHITECTURE.md)

High-level system architecture and component interactions:

- Layered architecture pattern
- Data flow and request processing
- Security architecture
- Scalability considerations
- External service integration

### API and Development

#### [🌐 API Documentation](./API_DOCUMENTATION.md)

Complete REST API reference with examples:

- Authentication endpoints
- Subscription management
- File upload endpoints
- Admin endpoints
- Error codes and rate limiting

#### [⚙️ Development Setup](./DEVELOPMENT_SETUP.md)

Step-by-step guide for setting up the development environment:

- Prerequisites and dependencies
- Local development workflow
- Testing setup and debugging
- IDE configuration
- Troubleshooting common issues

### Security Documentation

#### [🔒 ESLint Security Configuration](../ESLINT_SECURITY.md)

ESLint security plugin configuration and usage:

- Security rule explanations
- Common vulnerability patterns
- Configuration examples
- Troubleshooting guide

## 🚀 Quick Start

If you're new to the project, follow this order:

1. **[Development Setup](./DEVELOPMENT_SETUP.md)** - Get your environment running
2. **[Architecture Overview](./ARCHITECTURE.md)** - Understand the system design
3. **[Coding Standards](./CODING_STANDARDS.md)** - Learn the coding conventions
4. **[Database Guide](./DATABASE_GUIDE.md)** - Work with data effectively
5. **[API Documentation](./API_DOCUMENTATION.md)** - Integrate with the API

## 📋 Development Checklist

Before contributing to the project, ensure you understand:

- [ ] Project architecture and data flow
- [ ] Coding standards and conventions
- [ ] Database schema and query patterns
- [ ] Authentication and security requirements
- [ ] Testing procedures and best practices
- [ ] Error handling and logging standards

## 🔧 Technology Stack

### Backend

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with 2FA support
- **Security**: ESLint security plugin, CSRF protection, rate limiting

### Frontend

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS

### Development Tools

- **Code Quality**: ESLint, Prettier
- **Testing**: Jest (backend), Vitest (frontend)
- **Database**: Drizzle Studio for management
- **API Testing**: Thunder Client or similar

## 📖 Contributing Guidelines

### Code Quality Standards

1. **Follow the coding standards** outlined in `CODING_STANDARDS.md`
2. **Write comprehensive tests** for new features
3. **Document new APIs** in `API_DOCUMENTATION.md`
4. **Update architecture docs** for structural changes
5. **Use TypeScript strictly** with no `any` types

### Development Workflow

1. **Create feature branch** from main
2. **Follow naming conventions** for files and variables
3. **Write self-documenting code** with JSDoc comments
4. **Test thoroughly** before submitting PR
5. **Update documentation** for user-facing changes

### Security Considerations

- All user inputs must be validated using Zod schemas
- Database queries use Drizzle ORM for SQL injection prevention
- Authentication required for all protected endpoints
- Subscription checks enforced for premium features
- Comprehensive error logging without exposing internals

## 🐛 Troubleshooting

### Common Issues

- **Build failures**: Check TypeScript errors and dependency versions
- **Database connection**: Verify PostgreSQL is running and credentials are correct
- **ESLint errors**: Run `npm run lint:fix` to auto-fix issues
- **Test failures**: Ensure test database is set up correctly

### Getting Help

1. Check the relevant documentation section
2. Review existing code patterns in the codebase
3. Look at test files for usage examples
4. Consult the troubleshooting sections in setup guides

## 📝 Documentation Updates

This documentation should be updated when:

- New features or endpoints are added
- Architecture patterns change
- Development workflows are modified
- Security requirements are updated
- External dependencies change

## 🔗 External Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Express.js Guide](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [shadcn/ui Components](https://ui.shadcn.com/)

---

**Note**: This documentation is living and should be kept up-to-date with code changes. When you modify functionality, please update the relevant documentation sections.
