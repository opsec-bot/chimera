// Shared types for request bodies, responses, etc.

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Fallback declaration for cookie-parser if type resolution fails
declare module 'cookie-parser';
// Shared types for request bodies, responses, etc.

export interface ApiResponse {
  message: string;
  file?: string;
  error?: string;
}
