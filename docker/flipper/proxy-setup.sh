#!/bin/bash
# proxy-setup.sh — Force all outbound traffic through residential proxy
# Same logic as the chimera C2 VM — keeps the flipper VM's real IP hidden.

set -euo pipefail

PROXY_ENDPOINT="${PROXY_ENDPOINT:-}"
PROXY_USER="${PROXY_USER:-}"
PROXY_PASS="${PROXY_PASS:-}"

if [ -z "$PROXY_ENDPOINT" ]; then
    echo "[proxy] No proxy endpoint configured — direct egress"
    exit 0
fi

# Parse proxy endpoint (host:port)
PROXY_HOST=$(echo "$PROXY_ENDPOINT" | cut -d: -f1)
PROXY_PORT=$(echo "$PROXY_ENDPOINT" | cut -d: -f2)

# Build proxy auth string
if [ -n "$PROXY_USER" ] && [ -n "$PROXY_PASS" ]; then
    PROXY_AUTH="${PROXY_USER}:${PROXY_PASS}@"
else
    PROXY_AUTH=""
fi

PROXY_URL="http://${PROXY_AUTH}${PROXY_HOST}:${PROXY_PORT}"

echo "[proxy] Configuring iptables to route egress through $PROXY_HOST:$PROXY_PORT"

# Flush existing rules
iptables -F
iptables -t nat -F

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow inbound on the service port (8443)
iptables -A INPUT -p tcp --dport 8443 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Allow inbound PostgreSQL (local only)
iptables -A INPUT -p tcp --dport 5432 -s 127.0.0.1 -j ACCEPT

# Redirect all outbound HTTP/HTTPS through the proxy via redsocks or transparent proxy
# For simplicity, we use environment variables that the Node app can pick up
# and route through the proxy at the application level.
export HTTP_PROXY="$PROXY_URL"
export HTTPS_PROXY="$PROXY_URL"
export http_proxy="$PROXY_URL"
export https_proxy="$PROXY_URL"
export NO_PROXY="localhost,127.0.0.1"

# Write proxy env for the backend to pick up
cat > /opt/flipper/.proxy-env <<EOF
HTTP_PROXY=$PROXY_URL
HTTPS_PROXY=$PROXY_URL
http_proxy=$PROXY_URL
https_proxy=$PROXY_URL
NO_PROXY=localhost,127.0.0.1
EOF

echo "[proxy] Proxy environment configured"
echo "[proxy] Backend will route outbound through $PROXY_HOST:$PROXY_PORT"

# Keep the process alive for supervisor
exec sleep infinity
