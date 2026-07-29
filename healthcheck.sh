#!/bin/bash
# healthcheck.sh — Verify C2 server is alive and serving
# Called by Docker HEALTHCHECK and supervisor monitor

set -euo pipefail

PORT="${LISTEN_PORT:-8443}"

# Check 1: Is the Sliver process running?
if ! pgrep -x sliver > /dev/null 2>&1; then
    echo "[health] Sliver process not found"
    exit 1
fi

# Check 2: Is the listener port accepting connections?
if ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    echo "[health] Port $PORT not responding"
    exit 1
fi

# Check 3: Does the C2 respond to a beacon-style request?
#    Send a minimal HTTP request to the /api/beacon endpoint
RESP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "http://127.0.0.1:${PORT}/api/beacon" \
    -H "Content-Type: application/octet-stream" \
    -H "X-CSRF-Token: ${SESSION_KEY:-test}" \
    -d "\x00\x01" \
    --max-time 5 2>/dev/null || echo "000")

# Sliver should respond with 200 (valid beacon) or 401 (bad key) — both mean it's alive
if [ "$RESP" = "200" ] || [ "$RESP" = "401" ] || [ "$RESP" = "400" ]; then
    echo "[health] C2 healthy (HTTP $RESP)"
    exit 0
else
    echo "[health] C2 unhealthy (HTTP $RESP)"
    exit 1
fi
