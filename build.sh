#!/bin/bash
# build.sh — Build and push the C2 image to Fly's registry
# Run this ONCE from your admin machine. The rotation engine pulls this image
# on every cycle — no need to rebuild unless you change the C2 config.

set -euo pipefail

FLY_APP="chimera-c2"
REGISTRY="registry.fly.io"

echo "[build] Authenticating to Fly registry..."
flyctl auth docker

echo "[build] Building image..."
docker build \
    --build-arg SLIVER_VERSION=v1.5.41 \
    -t "${REGISTRY}/${FLY_APP}:latest" \
    -t "${REGISTRY}/${FLY_APP}:$(date +%Y%m%d-%H%M%S)" \
    .

echo "[build] Pushing to Fly registry..."
docker push "${REGISTRY}/${FLY_APP}:latest"

echo "[build] Done. Image: ${REGISTRY}/${FLY_APP}:latest"
echo "[build] The rotation engine will pull this on every provision cycle."
