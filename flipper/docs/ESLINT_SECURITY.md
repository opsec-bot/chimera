# ESLint Security Configuration

This project uses a comprehensive ESLint configuration with enhanced security checks, strict TypeScript rules, and best practices enforcement.

## Features

### 🛡️ Security Features

- **eslint-plugin-security**: Detects potential security vulnerabilities
- Object injection detection
- Non-literal filesystem operations detection
- Unsafe regex pattern detection
- Timing attack prevention
- Pseudorandom bytes usage warnings

### 📝 TypeScript Strict Checking

- **No unused variables**: Enforces clean code with `@typescript-eslint/no-unused-vars`
- **Explicit types**: Requires function return types and module boundary types
- **Type safety**: Prevents `any` usage and unsafe type operations
- **Async/await**: Proper promise handling and async function validation
- **Nullish coalescing**: Safer null checks with `??` operator

### ⚛️ React-Specific Rules (Frontend)

- React Hooks rules validation
- JSX accessibility (a11y) checking
- React best practices enforcement
- Component optimization rules

### 📦 Import Management

- Proper import ordering and grouping
- No circular dependencies
- Path resolution validation
- Unused imports detection

## Configuration Files

### Backend (`eslint.config.js`)

- **Location**: `c:\Users\tav08\Documents\GitHub\flipper\eslint.config.js`
- **Format**: ESLint v9 Flat Config
- **Plugins**: TypeScript, Security, Import, Node, Promise
- **Target**: Node.js TypeScript backend

### Frontend (`eslint.config.cjs`)

- **Location**: `c:\Users\tav08\Documents\GitHub\flipper\web\eslint.config.cjs`
- **Format**: ESLint v9 Flat Config (CommonJS for ES module compatibility)
- **Plugins**: TypeScript, Security, Import, React, React Hooks, JSX A11y
- **Target**: React TypeScript frontend

## Usage

### Backend Commands

```bash
# Lint TypeScript files
npm run lint

# Lint and auto-fix issues
npm run lint:fix

# Security-focused linting
npm run lint:security

# Type checking only
npm run type-check
```

### Frontend Commands

```bash
# Change to frontend directory
cd web

# Lint TypeScript/React files
npm run lint

# Lint and auto-fix issues
npm run lint:fix

# Security-focused linting
npm run lint:security

# Type checking only
npm run type-check
```

## Rule Categories

### 🚨 Error Rules (Must Fix)

- **Security violations**: Object injection, unsafe regex, timing attacks
- **Type safety**: Explicit `any`, unsafe type operations
- **Unused code**: Variables, imports, functions not matching `^_` pattern
- **Promise handling**: Missing await, floating promises
- **Best practices**: No eval, no implied eval, no process.exit

### ⚠️ Warning Rules (Should Fix)

- **Complexity**: Functions over 50 lines (backend) or 100 lines (frontend)
- **Code quality**: Sync methods in Node.js, console usage
- **Accessibility**: React a11y issues

### 📏 Style Rules (Auto-fixable)

- **Import ordering**: Alphabetical with proper grouping
- **Code style**: Prefer const, template literals, destructuring
- **TypeScript**: Prefer nullish coalescing, optional chaining

## Security Rules Breakdown

### Object Injection Prevention

```javascript
// ❌ Dangerous
const obj = {};
obj[userInput] = value;

// ✅ Safe
const allowedKeys = ['name', 'email'];
if (allowedKeys.includes(userInput)) {
  obj[userInput] = value;
}
```

### Filesystem Security

```javascript
// ❌ Dangerous
fs.readFile(userInput, callback);

// ✅ Safe
const safePath = path.join(basePath, path.basename(userInput));
fs.readFile(safePath, callback);
```

### Regex Safety

```javascript
// ❌ Dangerous (ReDoS vulnerability)
const regex = new RegExp(userInput);

// ✅ Safe
const safeRegex = /^[a-zA-Z0-9]+$/;
```

## Overrides and Exceptions

### Test Files

- Relaxed `@typescript-eslint/no-explicit-any` for mocking
- Disabled `security/detect-object-injection` for test utilities
- Relaxed function return type requirements

### Configuration Files

- Disabled explicit return types for config exports
- Allowed default exports for framework configs

### Scripts

- Console usage allowed in build/setup scripts
- Relaxed function signature requirements

## Integration with Development Workflow

### Pre-commit Hooks (Recommended)

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "git add"]
  }
}
```

### VS Code Integration

Add to `.vscode/settings.json`:

```json
{
  "eslint.validate": ["typescript", "typescriptreact"],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Common Issues and Solutions

### Import Resolution Errors

If you see "Unable to resolve path to module" errors:

1. Ensure TypeScript paths are configured in `tsconfig.json`
2. Check that `eslint-import-resolver-typescript` is installed
3. Verify file extensions in import statements

### Type Checking Errors

For "project" configuration errors:

1. Ensure `tsconfig.json` exists in the correct location
2. Check that `parserOptions.project` points to the right config
3. Verify TypeScript version compatibility

### Performance Issues

If linting is slow:

1. Use `--cache` flag for incremental linting
2. Consider excluding large directories in config
3. Use `--max-warnings` to limit output

## Maintenance

### Updating Rules

1. Review ESLint and plugin changelogs
2. Test rule changes on a subset of files first
3. Consider team feedback on rule strictness
4. Update documentation when rules change

### Adding New Security Rules

1. Research the security implications
2. Test on existing codebase
3. Provide clear error messages and examples
4. Document exceptions and overrides

## Resources

- [ESLint Security Plugin](https://github.com/nodesecurity/eslint-plugin-security)
- [TypeScript ESLint Rules](https://typescript-eslint.io/rules/)
- [React ESLint Plugin](https://github.com/jsx-eslint/eslint-plugin-react)
- [Import Plugin Rules](https://github.com/import-js/eslint-plugin-import)
