#!/bin/bash
# entrypoint.sh — Boot sequence for Flipper telemetry VM
# Runs on every fresh Fly.io VM provisioned by the chimera rotation engine.

set -euo pipefail

echo "[flipper] Booting telemetry platform..."
echo "[flipper] Session key: ${SESSION_KEY:0:8}..."
echo "[flipper] Listen port: ${LISTEN_PORT:-8443}"
echo "[flipper] Proxy mode: ${PROXY_MODE:-resi}"

# 1. Initialize embedded PostgreSQL (ephemeral — anti-forensic)
#    For persistent data, set DATABASE_URL to an external Postgres instance
#    and the embedded DB is skipped.
if [ -z "${DATABASE_URL:-}" ]; then
    echo "[flipper] Initializing embedded PostgreSQL..."
    bash /opt/flipper/init-db.sh
    export DATABASE_URL="postgresql://flipper:$(cat /opt/flipper/.pgpass)@localhost:5432/flipper_db"
else
    echo "[flipper] Using external DATABASE_URL"
fi

# 2. Generate self-signed TLS cert for nginx (Vercel terminates TLS publicly)
if [ ! -f /opt/flipper/certs/server.crt ]; then
    mkdir -p /opt/flipper/certs
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout /opt/flipper/certs/server.key \
        -out /opt/flipper/certs/server.crt \
        -days 1 \
        -subj "/CN=api.cloudsync.dev" \
        -addext "subjectAltName=DNS:api.cloudsync.dev" 2>/dev/null
    echo "[flipper] Generated internal TLS cert"
fi

# 3. Configure proxy environment (non-blocking — just writes env vars)
#    The proxy-setup.sh script writes HTTP_PROXY env vars for the backend
bash /opt/flipper/proxy-setup.sh &

# 4. Push database schema (drizzle-kit syncs schema to Postgres)
#    This creates all tables if they don't exist
echo "[flipper] Pushing database schema..."
cd /opt/flipper
npx drizzle-kit push:pg --schema=src/db/schema/* 2>/dev/null || echo "[flipper] Schema push warning (non-fatal, app will retry)"

# 5. Start supervisor (manages nginx + node backend + proxy + healthcheck)
echo "[flipper] Starting supervisor..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/flipper.conf
