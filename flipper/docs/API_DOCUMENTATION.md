# API Documentation

This document describes the REST API endpoints available in the Flipper application.

## Base URL

```
Development: http://localhost:3000
Production: https://your-domain.com
```

## Authentication

The API uses session-based authentication. After successful login, all subsequent requests will include the session cookie automatically.

### Headers

```http
Content-Type: application/json
X-Requested-With: XMLHttpRequest
```

## Response Format

All API responses follow a consistent format:

### Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Optional success message"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error message",
  "details": {}
}
```

## Authentication Endpoints

### POST /auth/register

Register a new user account.

**Request Body:**

```json
{
  "username": "string (3-50 characters)",
  "password": "string (minimum 8 characters)",
  "inviteCode": "string (optional)"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "username": "newuser",
      "isAdmin": false,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  },
  "message": "Account created successfully"
}
```

**Error Responses:**

- `400` - Invalid input data
- `409` - Username already exists
- `422` - Invalid invite code

### POST /auth/login

Authenticate user and create session.

**Request Body:**

```json
{
  "username": "string",
  "password": "string",
  "totpCode": "string (optional, required if 2FA enabled)"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "username": "user123",
      "isAdmin": false
    }
  },
  "message": "Login successful"
}
```

**Error Responses:**

- `401` - Invalid credentials
- `422` - 2FA code required or invalid

### POST /auth/logout

End user session.

**Success Response (200):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### GET /auth/me

Get current authenticated user information.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 123,
      "username": "user123",
      "isAdmin": false,
      "totpEnabled": true,
      "lastLogin": "2024-01-01T12:00:00Z"
    }
  }
}
```

**Error Response:**

- `401` - Not authenticated

## Two-Factor Authentication

### POST /auth/totp/setup

Initialize 2FA setup for the user.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "qrCode": "data:image/png;base64,...",
    "secret": "base32-encoded-secret",
    "backupCodes": ["code1", "code2", "..."]
  }
}
```

### POST /auth/totp/verify

Verify 2FA setup with TOTP code.

**Request Body:**

```json
{
  "totpCode": "123456"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "2FA enabled successfully"
}
```

### POST /auth/totp/disable

Disable 2FA for the user.

**Request Body:**

```json
{
  "password": "string",
  "totpCode": "123456"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "2FA disabled successfully"
}
```

## Subscription Endpoints

### GET /subscription/status

Get current user's subscription status.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "hasActiveSubscription": true,
    "subscription": {
      "id": 456,
      "type": "MONTH",
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-02-01T00:00:00Z",
      "isActive": true
    }
  }
}
```

### GET /subscription/tiers

Get available subscription plans.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "tiers": [
      {
        "type": "WEEK",
        "name": "Weekly",
        "duration": 7,
        "price": 9.99,
        "currency": "USD"
      },
      {
        "type": "MONTH",
        "name": "Monthly",
        "duration": 30,
        "price": 29.99,
        "currency": "USD"
      },
      {
        "type": "THREE_MONTHS",
        "name": "Quarterly",
        "duration": 90,
        "price": 79.99,
        "currency": "USD"
      }
    ]
  }
}
```

### POST /subscription/purchase

Create a payment invoice for subscription purchase.

**Request Body:**

```json
{
  "type": "WEEK | MONTH | THREE_MONTHS",
  "paymentMethod": "crypto"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "invoice": {
      "id": "inv_123",
      "amount": 29.99,
      "currency": "USD",
      "paymentUrl": "https://payment-provider.com/pay/inv_123",
      "expiresAt": "2024-01-01T01:00:00Z"
    }
  }
}
```

### GET /subscription/history

Get user's subscription history.

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "id": 456,
        "type": "MONTH",
        "startDate": "2024-01-01T00:00:00Z",
        "endDate": "2024-02-01T00:00:00Z",
        "isActive": false,
        "payment": {
          "amount": 29.99,
          "currency": "USD",
          "paidAt": "2024-01-01T00:30:00Z"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

## File Upload Endpoints

### POST /wallets/upload

Upload wallet data for processing.

**Content-Type:** `multipart/form-data`

**Form Fields:**

- `file` (optional): Wallet data file
- `data` (optional): JSON string with wallet data

**Request Body (JSON data):**

```json
{
  "data": {
    "xe_wallet": "wallet_address_here",
    "xe_mnemonic": "twelve word mnemonic phrase here"
  }
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "submissionId": 789,
    "walletAddress": "wallet_address_here",
    "balanceUsd": 1234.56,
    "processedAt": "2024-01-01T12:00:00Z"
  }
}
```

**Error Responses:**

- `400` - Invalid wallet data format
- `413` - File too large
- `422` - Validation failed

### POST /browser/upload

Upload browser data files.

**Content-Type:** `multipart/form-data`

**Form Fields:**

- `files`: Browser data files (multiple files supported)

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "submissionId": 790,
    "filesProcessed": 3,
    "totalSize": 1048576,
    "processedAt": "2024-01-01T12:00:00Z"
  }
}
```

## Search Endpoints

### GET /search

Search through uploaded data.

**Query Parameters:**

- `q`: Search query string
- `type` (optional): Data type filter (`wallets`, `browsers`, `all`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20)

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": 123,
        "type": "wallet",
        "content": "search result content...",
        "createdAt": "2024-01-01T12:00:00Z",
        "userId": 456
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "pages": 5
    },
    "filters": {
      "type": "all",
      "query": "search term"
    }
  }
}
```

## Admin Endpoints

All admin endpoints require administrator privileges.

### GET /admin/users

Get list of all users.

**Query Parameters:**

- `page` (optional): Page number
- `limit` (optional): Results per page
- `search` (optional): Search by username

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": 123,
        "username": "user123",
        "isAdmin": false,
        "createdAt": "2024-01-01T00:00:00Z",
        "lastLogin": "2024-01-01T12:00:00Z",
        "subscriptionStatus": "active"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1000,
      "pages": 20
    }
  }
}
```

### POST /admin/users/:userId/subscription

Grant subscription to a user.

**Path Parameters:**

- `userId`: User ID

**Request Body:**

```json
{
  "type": "WEEK | MONTH | THREE_MONTHS",
  "reason": "Administrative grant"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "subscription": {
      "id": 789,
      "userId": 123,
      "type": "MONTH",
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-02-01T00:00:00Z"
    }
  },
  "message": "Subscription granted successfully"
}
```

### GET /admin/stats

Get system statistics.

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "totalUsers": 1000,
    "activeSubscriptions": 450,
    "totalSubmissions": 5000,
    "revenueThisMonth": 12500.0,
    "systemHealth": "healthy"
  }
}
```

## Payment Webhook Endpoints

### POST /payment/webhook

Handle payment provider webhooks.

**Headers:**

```http
Content-Type: application/json
X-Webhook-Signature: signature_hash
```

**Request Body:** (varies by payment provider)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Webhook processed"
}
```

## Error Codes

| Code | Description                                    |
| ---- | ---------------------------------------------- |
| 400  | Bad Request - Invalid input data               |
| 401  | Unauthorized - Authentication required         |
| 403  | Forbidden - Insufficient permissions           |
| 404  | Not Found - Resource not found                 |
| 409  | Conflict - Resource already exists             |
| 413  | Payload Too Large - File size exceeded         |
| 422  | Unprocessable Entity - Validation failed       |
| 429  | Too Many Requests - Rate limit exceeded        |
| 500  | Internal Server Error - Server error           |
| 503  | Service Unavailable - Temporary unavailability |

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Authentication endpoints**: 5 requests per minute per IP
- **File upload endpoints**: 10 requests per minute per user
- **General API endpoints**: 100 requests per minute per user
- **Search endpoints**: 30 requests per minute per user

When rate limit is exceeded, the API returns:

```json
{
  "success": false,
  "error": "Too many requests",
  "retryAfter": 60
}
```

## CSRF Protection

All state-changing requests (POST, PUT, DELETE) require a CSRF token:

1. Get CSRF token from `/auth/csrf`
2. Include token in request header: `X-CSRF-Token: your_token_here`

## WebSocket Events (Live Updates)

The application supports real-time updates via WebSocket connection:

### Connection

```javascript
const ws = new WebSocket('wss://your-domain.com/ws');
```

### Events

#### Subscription Status Updates

```json
{
  "type": "subscription_update",
  "data": {
    "userId": 123,
    "status": "active",
    "subscription": {
      "type": "MONTH",
      "endDate": "2024-02-01T00:00:00Z"
    }
  }
}
```

#### Payment Confirmations

```json
{
  "type": "payment_confirmed",
  "data": {
    "paymentId": "pay_123",
    "subscriptionId": 456,
    "amount": 29.99
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
class FlipperAPI {
  private baseURL = 'http://localhost:3000';

  async login(username: string, password: string) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    return response.json();
  }

  async uploadWalletData(walletData: { xe_wallet: string; xe_mnemonic: string }) {
    const response = await fetch(`${this.baseURL}/wallets/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data: walletData }),
    });

    return response.json();
  }
}
```

### cURL Examples

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user123","password":"password123"}' \
  -c cookies.txt

# Upload wallet data (using saved cookies)
curl -X POST http://localhost:3000/wallets/upload \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"data":{"xe_wallet":"addr123","xe_mnemonic":"word1 word2 ..."}}'

# Get subscription status
curl -X GET http://localhost:3000/subscription/status \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

This API documentation provides comprehensive information for integrating with the Flipper application. For additional support or questions, please refer to the development team.
