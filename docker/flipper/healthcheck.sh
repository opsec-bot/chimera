#!/bin/bash
# healthcheck.sh — Verify flipper is alive
# Checks nginx (public port) and Express backend (internal port)

set -euo pipefail

# Check nginx on 8443
if ! curl -sk -o /dev/null -w "%{http_code}" https://localhost:8443/ | grep -q "200\|302\|301"; then
    echo "[health] nginx not responding on 8443"
    exit 1
fi

# Check Express backend on 3000
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200\|302\|301"; then
    echo "[health] backend not responding on 3000"
    exit 1
fi

echo "[health] OK"
exit 0
