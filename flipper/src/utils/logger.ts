import winston from 'winston';
import path from 'path';

/**
 * Logger configuration and instance for the application
 * Provides structured logging with different levels and formats
 */

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(logColors);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message, ...meta } = info;
    let metaString = '';
    if (Object.keys(meta).length > 0) {
      metaString = ` ${JSON.stringify(meta)}`;
    }
    // Ensure message is string
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    return `[${timestamp}] ${level}: ${msg}${metaString}`;
  }),
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Create the logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: { service: 'flipper-backend' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],

  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat,
    }),
  ],

  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat,
    }),
  ],
});

/**
 * Logger utility functions for different log levels
 */
export const Logger = {
  /**
   * Log error messages
   * @param message - Error message
   * @param meta - Additional metadata
   */
  error: (message: string, meta?: Record<string, unknown>): void => {
    logger.error(message, meta);
  },

  /**
   * Log warning messages
   * @param message - Warning message
   * @param meta - Additional metadata
   */
  warn: (message: string, meta?: Record<string, unknown>): void => {
    logger.warn(message, meta);
  },

  /**
   * Log info messages
   * @param message - Info message
   * @param meta - Additional metadata
   */
  info: (message: string, meta?: Record<string, unknown>): void => {
    logger.info(message, meta);
  },

  /**
   * Log HTTP requests
   * @param message - HTTP message
   * @param meta - Additional metadata
   */
  http: (message: string, meta?: Record<string, unknown>): void => {
    logger.http(message, meta);
  },

  /**
   * Log debug messages
   * @param message - Debug message
   * @param meta - Additional metadata
   */
  debug: (message: string, meta?: Record<string, unknown>): void => {
    logger.debug(message, meta);
  },

  /**
   * Log database operations
   * @param operation - Database operation
   * @param table - Database table
   * @param meta - Additional metadata
   */
  database: (operation: string, table: string, meta?: Record<string, unknown>): void => {
    logger.debug(`Database ${operation} on ${table}`, meta);
  },

  /**
   * Log authentication events
   * @param event - Auth event type
   * @param userId - User ID
   * @param meta - Additional metadata
   */
  auth: (event: string, userId?: number, meta?: Record<string, unknown>): void => {
    logger.info(`Auth: ${event}`, { userId, ...meta });
  },

  /**
   * Log file operations
   * @param operation - File operation
   * @param fileName - File name
   * @param meta - Additional metadata
   */
  file: (operation: string, fileName: string, meta?: Record<string, unknown>): void => {
    logger.info(`File ${operation}: ${fileName}`, meta);
  },

  /**
   * Log API requests with sanitized data (removes sensitive info)
   * @param method - HTTP method
   * @param url - Request URL
   * @param userId - User ID if authenticated
   * @param meta - Additional metadata
   */
  api: (method: string, url: string, userId?: number, meta?: Record<string, unknown>): void => {
    const sanitizedMeta: Record<string, unknown> = { ...meta };
    // Recursive redaction helper
    const redact = (obj: any, depth = 0) => {
      if (!obj || depth > 5) return;
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => {
          if (typeof v === 'string') obj[i] = maskIfSecret(v);
          else if (typeof v === 'object') redact(v, depth + 1);
        });
        return;
      }
      Object.keys(obj).forEach((k) => {
        const lower = k.toLowerCase();
        const value = (obj as any)[k];
        if (typeof value === 'string') {
          if (shouldRedactKey(lower)) {
            (obj as any)[k] = maskValue(value);
          } else {
            (obj as any)[k] = maskIfSecret(value);
          }
        } else if (typeof value === 'object' && value !== null) {
          redact(value, depth + 1);
        }
      });
    };
    const sensitiveKeys = [
      'password',
      'pass',
      'pwd',
      'token',
      'csrf',
      'access_key',
      'apikey',
      'api_key',
      'secret',
      'authorization',
      'auth',
    ];
    const shouldRedactKey = (k: string) => sensitiveKeys.some((s) => k.includes(s));
    const maskValue = (v: string) => (v.length <= 8 ? '***' : v.slice(0, 2) + '***' + v.slice(-2));
    const secretPattern =
      /bearer\s+[a-z0-9._-]+|sk_[a-z0-9]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+|[A-F0-9]{32,}|[a-f0-9]{40,}/i;
    const maskIfSecret = (v: string) => (secretPattern.test(v) ? maskValue(v) : v);

    redact(sanitizedMeta);
    // Remove raw session data if any slipped in
    delete (sanitizedMeta as any).session;
    logger.http(`${method} ${url}`, { userId, ...sanitizedMeta });
  },
};

// Create logs directory on module load
import fs from 'fs';
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default Logger;
