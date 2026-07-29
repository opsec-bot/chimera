import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { AuthPage } from './pages/AuthPage';
import { LinkTelegram } from './pages/LinkTelegram';
import { LandingPage } from './pages/LandingPage';
// initialize sound notifications module (attaches to window)
import './lib/soundNotifications';
import { getJson } from './utils/api';
import { ServerIssue } from './pages/ServerIssue';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const SubscriptionsPage = lazy(() =>
  import('./pages/Subscriptions').then((m) => ({ default: m.Subscriptions })),
);
const AdminPanel = lazy(() =>
  import('./pages/AdminPanel').then((m) => ({ default: m.AdminPanel })),
);
const Builder = lazy(() => import('./pages/Builder').then((m) => ({ default: m.Builder })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

function AppContent() {
  const location = useLocation();
  const showHeader = !location.pathname.startsWith('/auth') && location.pathname !== '/';
  const [meChecked, setMeChecked] = React.useState(false);
  const [me, setMe] = React.useState<any>(null);
  const [serverIssue, setServerIssue] = React.useState<null | {
    code: string;
    timestamp: string;
    error?: string;
    lastAttempt: number;
  }>(null);

  const ERROR_CODE = 'ERR-PROXY-UNREACHABLE';

  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runAuthCheck = React.useCallback(async () => {
    // Don't run auth check if we're on landing page
    if (location.pathname === '/') {
      return;
    }

    // Don't run auth check if we're on auth pages and already checked
    if (location.pathname.startsWith('/auth') && meChecked) {
      return;
    }

    const clearIssue = () => setServerIssue((prev) => (prev ? null : prev));

    try {
      // Use cached auth data first, fall back to direct fetch if needed
      const { getCachedAuthData } = await import('./utils/authCache');
      let authData = null;
      try {
        authData = await getCachedAuthData();
      } catch (cacheError) {
        // If cache fails, fall back to direct fetch
        const r = await fetch('/auth/me', { credentials: 'include' });
        if (!mountedRef.current) return;
        clearIssue();
        if (!r.ok) {
          // Treat 5xx as server issue
          if (r.status >= 500) {
            setServerIssue({
              code: ERROR_CODE,
              timestamp: new Date().toISOString(),
              error: `HTTP ${r.status}`,
              lastAttempt: Date.now(),
            });
            return;
          }
          // Unauthorized / other -> proceed with existing redirect logic
          setMe(null);
          return;
        }
        const data = await r.json();
        authData = { user: data.user || data, csrfToken: data.csrfToken };
      }

      if (!mountedRef.current) return;
      clearIssue();

      if (!authData) {
        // No auth data available, treat as unauthenticated
        setMe(null);
        setMeChecked(true);
        // Only redirect to auth if user is trying to access protected routes
        // Allow landing page (/) and auth pages to be accessed without authentication
        if (!location.pathname.startsWith('/auth') && location.pathname !== '/') {
          window.location.replace('/auth');
        }
        return;
      }

      // Process the auth data
      const user = authData.user || null;
      setMe(user);
      setMeChecked(true);

      // Note: redirecting from /auth is handled by AuthEntry component below
      // Client-side safety: if user is on dashboard but has no active subscription, bounce to subscriptions.
      if (location.pathname.startsWith('/dashboard')) {
        try {
          const sub = await fetch('/subscription/status', { credentials: 'include' });
          if (!mountedRef.current) return;
          if (sub.ok) {
            const s = await sub.json();
            const hasActive = s?.has_active_subscription ?? s?.hasActiveSubscription;
            if (!hasActive) {
              window.location.replace('/subscriptions');
              return;
            }
          }
        } catch (_) {}
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      // Network / proxy failure
      setServerIssue({
        code: ERROR_CODE,
        timestamp: new Date().toISOString(),
        error: err?.message || String(err),
        lastAttempt: Date.now(),
      });
    }
  }, [location.pathname, meChecked]);

  // Route-level protection: only run auth checks when a protected route is mounted
  const Protected: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    React.useEffect(() => {
      runAuthCheck();
      // We intentionally only run this when mounted; protected routes will re-run on navigation
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // While checking auth, render nothing to avoid flashes
    if (!meChecked) return null;
    // If unauthenticated, runAuthCheck will have redirected to /auth; keep render empty
    if (!me) return null;
    return <>{children}</>;
  };

  // When visiting /auth, check if already logged in; if so, redirect to /dashboard.
  const AuthEntry: React.FC = () => {
    React.useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const r = await fetch('/auth/me', { credentials: 'include' });
          if (!cancelled && r.ok) {
            // Already authenticated → go to dashboard
            window.location.replace('/dashboard');
          }
        } catch {
          // ignore – stay on auth page
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);
    return <AuthPage />;
  };

  if (serverIssue) {
    return (
      <ServerIssue
        code={serverIssue.code}
        timestamp={serverIssue.timestamp}
        errorMessage={serverIssue.error}
        onRetry={() => {
          setServerIssue(null);
          runAuthCheck();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* top-level small nav removed to avoid duplicating the in-page AppHeader provided by PageLayout */}
      <main>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthEntry />} />
            <Route path="/auth/" element={<AuthEntry />} />
            <Route path="/auth/link-telegram" element={<LinkTelegram />} />
            <Route
              path="/dashboard"
              element={
                <Protected>
                  <Dashboard />
                </Protected>
              }
            />
            <Route
              path="/subscriptions"
              element={
                <Protected>
                  <SubscriptionsPage />
                </Protected>
              }
            />
            <Route
              path="/admin"
              element={
                <Protected>
                  <AdminPanel />
                </Protected>
              }
            />
            <Route
              path="/builder"
              element={
                <Protected>
                  <Builder />
                </Protected>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppContent />
      <Toaster />
    </BrowserRouter>
  );
}
