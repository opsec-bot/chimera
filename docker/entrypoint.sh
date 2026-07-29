#!/bin/bash
# entrypoint.sh — Boot sequence for Chimera C2 VM
# Runs on every fresh Fly.io VM provisioned by the rotation engine.

set -euo pipefail

echo "[chimera] Booting C2 server..."
echo "[chimera] Session key: ${SESSION_KEY:0:8}..."
echo "[chimera] Listen port: ${LISTEN_PORT:-8443}"
echo "[chimera] Proxy mode: ${PROXY_MODE:-resi}"

# 1. Generate runtime sliver.toml from template using env vars
envsubst < /opt/chimera/sliver.toml > /opt/chimera/sliver_runtime.toml

# 2. Generate self-signed TLS cert for the internal listener
#    (Vercel terminates TLS publicly — this is just for the Vercel→Fly hop)
if [ ! -f /opt/chimera/certs/server.crt ]; then
    mkdir -p /opt/chimera/certs
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout /opt/chimera/certs/server.key \
        -out /opt/chimera/certs/server.crt \
        -days 1 \
        -subj "/CN=api.cloudsync.dev" \
        -addext "subjectAltName=DNS:api.cloudsync.dev" 2>/dev/null
    echo "[chimera] Generated internal TLS cert"
fi

# 3. Configure iptables: force ALL outbound traffic through proxy chain
#    This ensures the C2 server's real Fly.io IP never touches the target
bash /opt/chimera/proxy-setup.sh

# 4. Start supervisor (manages Sliver + proxy + healthcheck)
echo "[chimera] Starting supervisor..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/chimera.conf
