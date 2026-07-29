# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Flipper is a two-tier app: an Express/TypeScript backend (`src/`) and a Vite + React + Tailwind frontend (`web/`) that is mid-migration from legacy static pages in `public/`. The backend serves API routes and session-based auth; the React app proxies API calls to it in dev.

### Backend (`src/`)
- Entrypoint: `src/server.ts` → `src/app.ts`. `app.ts` wires session middleware (in-memory store), helmet CSP, CSRF (`middleware/csrf.ts`), a custom **server-side routing guard** that redirects unauthenticated nav to `/auth`, redirects authed users hitting `/auth` based on role/subscription, and gates `/admin` to admins.
- Routes (`src/routes/`) are split between **HTML/page routes** (`auth`, `dashboard`, `admin`, `subscription(s)`, `builder`, `payment`) and **data-collection APIs** (`/api/browser`, `/api/filesearch`, `/api/wallets`, `/api/asar`, `/api/search`). The data APIs require an active subscription + access key (`middleware/accessKey.ts`, `middleware/subscription.ts`).
- Services (`src/services/`) hold business logic: `subscriptionService`, `paymentService` (OxaPay via `services/oxapay.ts`), `userService`, `stubBuilder*` and `rustBuildService` (executable builders), `telegram*` (TG-bot password reset + link flows), `liveUpdateService` (SSE/live notifications), `subscriptionCodes*`.
- Database: PostgreSQL via Drizzle ORM. Schemas in `src/db/schema/*` (users, invites, subscriptions, subscriptionCodes, payments, submissions, backupCodes, other). Connection in `src/db/connection.ts`. Drizzle config at `drizzle.config.ts` (`DATABASE_URL` env var required).
- Periodic jobs are started in `app.ts` after init: 15-min cleanup loop (expired stub builds, old builds, expired telegram link codes, overdue pending payments, subscription codes) plus a cron-backed `SubscriptionCodesCleanupService`. The Telegram password-reset bot auto-starts if its DB-stored runtime flag is set.
- The admin API normalizes responses to snake_case (see recent commits) — preserve this when adding admin endpoints.

### Frontend (`web/`)
- Vite + React 18 + TypeScript + Tailwind v4 + shadcn-ui (Radix primitives). Entry: `web/src/main.tsx` → `App.tsx`. Path alias `@/` → `web/src/`.
- Dev server runs on port 5173 and proxies a long list of backend paths (see `web/vite.config.ts`) to `http://localhost:3000`, with `cookieDomainRewrite: 'localhost'` so session cookies work cross-port. When adding a new backend route the React app needs to call, **add a proxy entry here** — otherwise the dev server will try to serve it as a SPA route.
- The legacy `public/` HTML pages are being replaced by React routes. `app.ts` only serves `/js` and `/sounds` static assets from `public/` now; do not re-add static HTML mounts.

### Auth & access model
Session cookie (`express-session`, MemoryStore) → `req.session.userId` / `req.session.isAdmin`. Data-collection endpoints additionally require a per-user **access key** validated by `middleware/accessKey.ts`. Subscriptions are tiered (Week/Month/3Mo) and gate both data APIs and builder features. Premium invite codes can pre-load a subscription on registration.

## Common Commands

Backend (run from repo root):
- `npm run dev` — ts-node-dev with hot reload (NODE_ENV=development)
- `npm run build` — `tsc` to `dist/`
- `npm start` — run built `dist/server.js`
- `npm run lint` / `npm run lint:fix` — ESLint on `src/**/*.ts`
- `npm run type-check` — `tsc --noEmit`
- `npm run setup` — runs `src/setup-database.ts` (initial DB setup)
- `npm run db:generate` / `db:push` / `db:migrate` / `db:studio` — drizzle-kit (pg driver). `npm run db:migrate:run` runs the in-repo migrator (`src/migrate.ts`).

Frontend (from `web/`):
- `npm run dev` — Vite dev server on :5173 (expects backend on :3000)
- `npm run build` — production build to `web/dist`
- `npm run lint` / `lint:fix` / `type-check`

Docker: `docker build -t flipper . && docker run -d --env-file .env -p 3000:3000 flipper`.

## Env

Required in `.env`: `PORT`, `NODE_ENV`, `SESSION_SECRET`, `DATABASE_URL` (Postgres connection string for Drizzle), `OXAPAY_MERCHANT_KEY` (use `sandbox` in dev). See `.env.example`.

## Notes

- This is a security-sensitive app (handles browser/wallet data + payments). The `eslint-plugin-security` ruleset is wired up; don't disable lint rules without cause.
- Sessions are persisted in Postgres via `connect-pg-simple` (table `session`, auto-created on first boot). Restarts and multi-instance deploys preserve sessions.
- When `NODE_ENV=production` the app sets `trust proxy` and `sameSite: 'strict'` secure cookies; in dev it uses `sameSite: 'lax'` so the Vite proxy works.
