# docker/flipper/Dockerfile
# Multi-stage build: Flipper telemetry platform (Express + React + Postgres + nginx)
# Target: registry.fly.io/chimera-flipper:latest
#
# This image runs:
#   - PostgreSQL 16 (embedded, ephemeral — data dies with the VM, anti-forensic)
#   - Node 22 (flipper Express backend on :3000)
#   - nginx (serves React frontend, reverse-proxies API to backend)
#   - supervisor (process manager)
#
# For persistent data across rotation cycles, point DATABASE_URL at an external
# Postgres instance instead of the embedded one.

# ---------------------------------------------------------------
# Stage 1: Build the React frontend
# ---------------------------------------------------------------
FROM node:22-alpine AS frontend-build

WORKDIR /app/web

# Copy web package files and install deps
COPY flipper/web/package.json flipper/web/package-lock.json* ./
RUN npm ci

# Copy web source and build
COPY flipper/web/ ./
RUN npm run build

# ---------------------------------------------------------------
# Stage 2: Build the Express backend
# ---------------------------------------------------------------
FROM node:22-alpine AS backend-build

WORKDIR /app

# Copy package files and install all deps (including dev for tsc)
COPY flipper/package.json flipper/package-lock.json* ./
RUN npm install

# Copy source and build TypeScript
COPY flipper/ ./

# Copy the built frontend so the backend can reference it if needed
COPY --from=frontend-build /app/web/dist ./web/dist

RUN npm run build

# Prune dev deps for smaller image — but keep drizzle-kit (needed for schema push on boot)
RUN npm prune --production || true
RUN npm install drizzle-kit@0.20.4 --save || true

# ---------------------------------------------------------------
# Stage 3: Final runtime image
# ---------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    NODE_ENV=production

# Install: PostgreSQL, nginx, supervisor, openssl, bash
RUN apk add --no-cache \
    postgresql16 \
    postgresql16-client \
    nginx \
    supervisor \
    openssl \
    bash \
    curl \
    iptables \
    iproute2 \
    socat \
    && mkdir -p /var/lib/postgresql/data \
    && mkdir -p /run/postgresql \
    && chown postgres:postgres /var/lib/postgresql/data \
    && chown postgres:postgres /run/postgresql

WORKDIR /opt/flipper

# Copy built backend
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/package.json ./package.json
COPY --from=backend-build /app/drizzle.config.ts ./
COPY --from=backend-build /app/web/dist ./web/dist

# Copy migration files (needed for db:migrate:run on boot)
COPY --from=backend-build /app/src/migrate.ts ./src/migrate.ts
COPY --from=backend-build /app/src/db ./src/db
COPY --from=backend-build /app/tsconfig.json ./
COPY --from=backend-build /app/drizzle.config.ts ./

# Copy Docker support files
COPY docker/flipper/entrypoint.sh /opt/flipper/entrypoint.sh
COPY docker/flipper/init-db.sh /opt/flipper/init-db.sh
COPY docker/flipper/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/flipper/supervisor.conf /etc/supervisor/conf.d/flipper.conf
COPY docker/flipper/proxy-setup.sh /opt/flipper/proxy-setup.sh
COPY docker/flipper/healthcheck.sh /opt/flipper/healthcheck.sh

RUN chmod +x /opt/flipper/entrypoint.sh \
    /opt/flipper/init-db.sh \
    /opt/flipper/proxy-setup.sh \
    /opt/flipper/healthcheck.sh

# Expose nginx (public-facing port — Vercel redirects here)
EXPOSE 8443

# Healthcheck: nginx must respond
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /opt/flipper/healthcheck.sh || exit 1

ENTRYPOINT ["/opt/flipper/entrypoint.sh"]
