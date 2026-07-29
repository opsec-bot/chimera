#!/bin/bash
# proxy-setup.sh — Force all C2 egress through residential proxy
# Uses redsocks-style transparent proxying via iptables + socat

set -euo pipefail

PROXY_URL="${PROXY_URL:-}"
PROXY_USER="${PROXY_USER:-}"
PROXY_PASS="${PROXY_PASS:-}"
PROXY_HOST="${PROXY_HOST:-}"
PROXY_PORT="${PROXY_PORT:-}"

# Parse PROXY_URL if provided as single env var
if [ -n "$PROXY_URL" ] && [ -z "$PROXY_HOST" ]; then
    # Format: http://user-session-xxx:pass@host:port
    PROXY_HOST=$(echo "$PROXY_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
    PROXY_PORT=$(echo "$PROXY_URL" | sed -n 's|.*:\([0-9]*\)$|\1|p')
    PROXY_USER=$(echo "$PROXY_URL" | sed -n 's|.*//\([^@]*\)@.*|\1|p')
    PROXY_PASS=$(echo "$PROXY_URL" | sed -n 's|.*:\([^@]*\)@.*|\1|p')
fi

if [ -z "$PROXY_HOST" ]; then
    echo "[proxy] No proxy configured — direct egress (NOT RECOMMENDED)"
    exit 0
fi

echo "[proxy] Configuring egress through ${PROXY_HOST}:${PROXY_PORT}"

# 1. Start socat as a local transparent proxy bridge
#    Listens on 127.0.0.1:1080, forwards through the residential proxy
#    using HTTP CONNECT tunneling
cat > /tmp/proxy_bridge.sh << 'BRIDGE'
#!/bin/bash
while true; do
    socat TCP-LISTEN:1080,reuseaddr,fork \
        PROXY:PROXY_HOST_PLACEHOLDER:PROXY_PORT_PLACEHOLDER,proxyport=PROXY_PORT_PLACEHOLDER
    sleep 2
done
BRIDGE

sed -i "s|PROXY_HOST_PLACEHOLDER|${PROXY_HOST}|g" /tmp/proxy_bridge.sh
sed -i "s|PROXY_PORT_PLACEHOLDER|${PROXY_PORT}|g" /tmp/proxy_bridge.sh
chmod +x /tmp/proxy_bridge.sh
/tmp/proxy_bridge.sh &

# 2. Configure proxychains for Sliver's outbound connections
cat > /etc/proxychains4.conf << EOF
strict_chain
proxy_dns
tcp_read_time_out 15000
tcp_connect_time_out 8000

[ProxyList]
http ${PROXY_HOST} ${PROXY_PORT} ${PROXY_USER} ${PROXY_PASS}
EOF

# 3. iptables: redirect all outbound traffic (except to the proxy itself)
#    through the local socat bridge → residential proxy
iptables -t nat -A OUTPUT -d 127.0.0.0/8 -j ACCEPT
iptables -t nat -A OUTPUT -d "${PROXY_HOST}" -j ACCEPT
iptables -t nat -A OUTPUT -p tcp --dport 80 -j REDIRECT --to-ports 1080
iptables -t nat -A OUTPUT -p tcp --dport 443 -j REDIRECT --to-ports 1080
iptables -t nat -A OUTPUT -p tcp --dport 445 -j REDIRECT --to-ports 1080
iptables -t nat -A OUTPUT -p tcp --dport 3389 -j REDIRECT --to-ports 1080
iptables -t nat -A OUTPUT -p tcp --dport 22 -j REDIRECT --to-ports 1080

echo "[proxy] iptables rules active — all egress routed through residential proxy"
echo "[proxy] Exit IP verification:"
curl -s --proxy "http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}" \
    https://api.ipify.org 2>/dev/null || echo "[proxy] Verification failed (non-fatal)"
