# Flipper - Subscription-Based Analytics & Device Telemetry Platform

A TypeScript/Express backend with a Vite + React + Tailwind frontend for secure telemetry ingestion, workspace management, and subscription-based analytics.

## Overview

Flipper is an invite-only platform designed for developers, researchers, and teams that need centralized device telemetry and analytics tools.

Core capabilities:

- **Telemetry Collection** — application metrics, system diagnostics, authorized client telemetry
- **Subscription Management** — tiered plans (Week / Month / 3-Month) with OxaPay integration
- **Invite System** — premium and standard invite codes with optional preloaded plans
- **Admin Dashboard** — user management, analytics, and system administration
- **Client Builder Tools** — generate authorized telemetry client configurations
- **Real-Time Updates** — live notifications, ingestion status, and payment updates via SSE

## Stack

- **Backend** — Node.js 18+ (Node 22 in Docker), Express 4, TypeScript, Drizzle ORM, PostgreSQL, `express-session` with `connect-pg-simple`, Helmet, custom CSRF.
- **Frontend** — Vite 5, React 18, TypeScript, Tailwind v4, shadcn-ui (Radix). Lives in `web/`.
- **Payments** — OxaPay (sandbox key supported in dev).

## Repository Layout

```text
flipper/
├── src/                    # Express + TS backend
│   ├── server.ts           # entrypoint
│   ├── app.ts              # middleware, auth guard, route wiring, cron jobs
│   ├── routes/             # auth, dashboard, admin, subscriptions, builder, payment, api/*
│   ├── controllers/
│   ├── services/           # subscription, payment, user, stubBuilder, telegram, liveUpdate
│   ├── middleware/         # csrf, accessKey, subscription gates
│   └── db/                 # drizzle schema + connection
├── web/                    # Vite + React + Tailwind frontend
│   ├── src/
│   └── vite.config.ts      # dev proxy → http://localhost:3000
├── public/                 # legacy assets (only /js and /sounds still served)
├── templates/              # rust/ and sdk/ build templates
├── Dockerfile
└── drizzle.config.ts
```

## Environment Variables

Create `.env` in the project root:

```env
# Postgres connection (required)
DATABASE_URL=postgresql://user:password@localhost:5432/flipper_db

# Session
SESSION_SECRET=replace-with-a-long-random-string

# OxaPay merchant key — use `sandbox` in dev, real key in prod
OXAPAY_MERCHANT_KEY=sandbox

# Server
PORT=3000
NODE_ENV=production

# Public base URL — HTTPS required for OxaPay callbacks (use ngrok in dev)
BASE_URL=https://your-domain.example

# Optional
LOG_LEVEL=info
```

`NODE_ENV=production` flips the app into `trust proxy` mode and uses `sameSite: 'strict'` secure cookies — so it **must** sit behind HTTPS (nginx, Cloudflare, etc.).

---

## Run Locally in Production Mode

This is the closest-to-prod local run (built JS, real Postgres, real session store). Useful for smoke-testing a release before deploying.

### 1. Install Postgres locally and create the DB

```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16

# Ubuntu/WSL
sudo apt install postgresql && sudo systemctl start postgresql

# then
createdb flipper_db
```

Set `DATABASE_URL` in `.env` to point at it.

### 2. Backend — build and run

From the repo root:

```bash
npm install
npm run db:migrate:run        # apply migrations
npm run build                 # tsc → dist/
NODE_ENV=production npm start # serves on :3000
```

The `session` table is auto-created on first boot by `connect-pg-simple`.

### 3. Frontend — build the static bundle

```bash
cd web
npm install
npm run build                 # output → web/dist/
```

In production the React bundle is served by a reverse proxy (nginx), **not** by Express — `src/app.ts` only mounts `/js` and `/sounds` from `public/` and the API routes. For a single-port local prod test, either:

- run `npm run preview` inside `web/` (serves `web/dist` on :4173), then put nginx in front routing `/api`, `/auth`, `/dashboard`, `/admin`, `/subscription`, `/subscription-codes`, `/payment`, `/builder`, `/uploads`, `/js`, `/sounds` → `:3000` and everything else → `:4173`; or
- run nginx pointing at `web/dist` directly (see the droplet section below — same config works locally).

### 4. Dev mode (hot reload, two ports)

If you just want to iterate quickly, skip the build:

```bash
# terminal 1
npm run dev                   # ts-node-dev on :3000

# terminal 2
cd web && npm run dev         # Vite on :5173 (proxies API calls to :3000)
```

Open `http://localhost:5173`. `web/vite.config.ts` lists every backend path that gets proxied — **if you add a new backend route the React app needs to call, add it there too** or Vite will try to serve it as a SPA route.

---

## Deploy to a DigitalOcean Droplet

Target: a fresh Ubuntu 22.04/24.04 droplet, single host running backend + Postgres + nginx. Domain pointed at the droplet IP.

### 1. Create the droplet

- Ubuntu 24.04 LTS, at least 2 GB RAM (the Rust stub builder is memory-hungry).
- Add your SSH key during creation.
- Point your domain's A record at the droplet IP.

SSH in:

```bash
ssh root@your.droplet.ip
```

### 2. Base packages

```bash
apt update && apt upgrade -y
apt install -y curl git build-essential ufw nginx postgresql postgresql-contrib

# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# PM2 process manager
npm install -g pm2
```

### 3. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Do **not** expose port 3000 — nginx fronts it.

### 4. Postgres

```bash
sudo -u postgres psql <<SQL
CREATE USER flipper WITH PASSWORD 'strong-password-here';
CREATE DATABASE flipper_db OWNER flipper;
GRANT ALL PRIVILEGES ON DATABASE flipper_db TO flipper;
SQL
```

### 5. Clone and configure

```bash
# Recommended: run as a non-root user
adduser deploy && usermod -aG sudo deploy
su - deploy

git clone https://github.com/<you>/flipper.git
cd flipper

cp .env.example .env
nano .env
```

Set in `.env`:

```env
DATABASE_URL=postgresql://flipper:strong-password-here@localhost:5432/flipper_db
SESSION_SECRET=<openssl rand -hex 32>
OXAPAY_MERCHANT_KEY=<your real OxaPay key>
PORT=3000
NODE_ENV=production
BASE_URL=https://your-domain.example
LOG_LEVEL=info
```

### 6. Build backend and frontend

```bash
# backend
npm ci
npm run db:migrate:run
npm run build

# frontend
cd web
npm ci
npm run build
cd ..
```

### 7. Run with PM2

```bash
pm2 start dist/server.js --name flipper --env production
pm2 save
pm2 startup systemd   # follow the printed command, then re-run `pm2 save`
```

Logs: `pm2 logs flipper`. Restart after pulling new code: `pm2 restart flipper`.

### 8. nginx

Create `/etc/nginx/sites-available/flipper`:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 50M;

    # React static bundle
    root /home/deploy/flipper/web/dist;
    index index.html;

    # Backend-served paths (API, auth, pages still owned by Express, assets)
    location ~ ^/(auth|dashboard|admin|subscription|subscriptions|subscription-codes|payment|builder|api|uploads|js|sounds)(/|$) {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE / live updates
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }

    # Everything else → React SPA
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable + reload:

```bash
sudo ln -s /etc/nginx/sites-available/flipper /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 9. HTTPS with certbot

OxaPay callbacks require HTTPS, and `NODE_ENV=production` cookies are `secure`, so TLS is mandatory.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

Certbot rewrites the nginx config to listen on 443 and adds an auto-renew timer.

### 10. Updating

```bash
cd ~/flipper
git pull
npm ci
npm run db:migrate:run
npm run build
cd web && npm ci && npm run build && cd ..
pm2 restart flipper
```

### Optional: Docker

A `Dockerfile` is included (Node 22 alpine, builds TypeScript, prunes dev deps). It only builds the **backend** — you still need to build `web/` and serve it via nginx, or extend the image to copy `web/dist` and add an Express static mount.

```bash
docker build -t flipper .
docker run -d --env-file .env -p 3000:3000 --name flipper flipper
```

---

## Common Commands

Backend (repo root):

| Command | Purpose |
| --- | --- |
| `npm run dev` | ts-node-dev with hot reload (NODE_ENV=development) |
| `npm run build` | compile `src/` → `dist/` |
| `npm start` | run built `dist/server.js` (NODE_ENV=production) |
| `npm run lint` / `lint:fix` | ESLint on `src/**/*.ts` |
| `npm run type-check` | `tsc --noEmit` |
| `npm run setup` | first-time DB setup (`src/setup-database.ts`) |
| `npm run db:generate` | drizzle-kit generate migration |
| `npm run db:migrate:run` | apply migrations via `src/migrate.ts` |
| `npm run db:studio` | Drizzle Studio |

Frontend (from `web/`):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite on :5173 (expects backend on :3000) |
| `npm run build` | production build → `web/dist` |
| `npm run preview` | serve built bundle on :4173 |
| `npm run lint` / `type-check` | ESLint / TS check |

---

## Auth & Access Model

- Session cookie (`express-session`, Postgres-backed) → `req.session.userId` / `req.session.isAdmin`.
- Data-collection endpoints additionally require a per-user **access key** (`middleware/accessKey.ts`).
- Subscriptions are tiered (Week / Month / 3-Month) and gate the data APIs and builder features.
- Premium invite codes can pre-load a subscription on registration.
- A server-side routing guard in `app.ts` redirects unauthenticated nav to `/auth`, redirects authed users hitting `/auth` based on role/subscription, and gates `/admin` to admins.

## Periodic Jobs

Started in `app.ts` after init:

- 15-min loop — expired stub builds, old builds, expired Telegram link codes, overdue pending payments, subscription codes.
- `SubscriptionCodesCleanupService` (cron-backed).
- Telegram password-reset bot auto-starts if its DB-stored runtime flag is set.

## Security Notes

- `eslint-plugin-security` is wired up — don't disable rules without cause.
- Helmet CSP + custom CSRF middleware on state-changing routes.
- Session store is Postgres (`connect-pg-simple`, table `session`), so restarts and multi-instance deploys preserve sessions.
- Handles browser/wallet data and payment flows — keep `SESSION_SECRET` strong and rotate the OxaPay key on compromise.

## License

All rights reserved. Proprietary software.
