# chimera-c2/Dockerfile
# Multi-stage build: Sliver server + auto-config + proxy routing
# Target: registry.fly.io/chimera-c2:latest

FROM ubuntu:22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC

# Core deps: networking, proxy tooling, TLS, Sliver runtime requirements
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    gnupg2 \
    iptables \
    iproute2 \
    iputils-ping \
    dnsutils \
    netcat-openbsd \
    socat \
    proxychains4 \
    tor \
    jq \
    python3 \
    python3-pip \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------
# Stage 2: Sliver C2 server
# ---------------------------------------------------------------
FROM base AS sliver-stage

# Sliver binary (pre-compiled, pinned version for reproducibility)
# Release assets are raw binaries, not zips:
#   sliver-server_linux (amd64), sliver-server_macos-arm64 (arm64)
ARG SLIVER_VERSION=v1.5.41
ARG SLIVER_URL="https://github.com/BishopFox/sliver/releases/download"

RUN ARCH=$(dpkg --print-architecture) && \
    case "$ARCH" in \
        amd64) SLIVER_BIN="sliver-server_linux" ;; \
        arm64) SLIVER_BIN="sliver-server_macos-arm64" ;; \
        *) echo "Unsupported arch: $ARCH" && exit 1 ;; \
    esac && \
    wget -qO /usr/local/bin/sliver \
        "${SLIVER_URL}/${SLIVER_VERSION}/${SLIVER_BIN}" && \
    chmod +x /usr/local/bin/sliver

# ---------------------------------------------------------------
# Stage 3: Final image
# ---------------------------------------------------------------
FROM sliver-stage

WORKDIR /opt/chimera

# Copy config files
COPY sliver.toml /opt/chimera/sliver.toml
COPY entrypoint.sh /opt/chimera/entrypoint.sh
COPY proxy-setup.sh /opt/chimera/proxy-setup.sh
COPY healthcheck.sh /opt/chimera/healthcheck.sh

RUN chmod +x /opt/chimera/entrypoint.sh \
    /opt/chimera/proxy-setup.sh \
    /opt/chimera/healthcheck.sh

# Supervisor config — manages Sliver + proxy chain + health monitor
COPY supervisor.conf /etc/supervisor/conf.d/chimera.conf

# Expose the C2 listener port (Vercel redirects /api/* → this port)
EXPOSE 8443

# Healthcheck: Sliver API must respond
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /opt/chimera/healthcheck.sh || exit 1

ENTRYPOINT ["/opt/chimera/entrypoint.sh"]
