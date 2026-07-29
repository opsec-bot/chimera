#!/bin/bash
# build.sh — Build and push the flipper image to Fly's registry
# Run this ONCE from the chimera repo root (or docker/flipper/).
# The rotation engine pulls this image on every provision cycle.

set -euo pipefail

FLY_APP="chimera-flipper"
REGISTRY="registry.fly.io"
CONTEXT="$(cd "$(dirname "$0")/../.." && pwd)"  # chimera repo root

echo "[build] Authenticating to Fly registry..."
flyctl auth docker

echo "[build] Building flipper image from $CONTEXT..."
docker build \
    -f "$CONTEXT/docker/flipper/Dockerfile" \
    -t "${REGISTRY}/${FLY_APP}:latest" \
    -t "${REGISTRY}/${FLY_APP}:$(date +%Y%m%d-%H%M%S)" \
    "$CONTEXT"

echo "[build] Pushing to Fly registry..."
docker push "${REGISTRY}/${FLY_APP}:latest"

echo "[build] Done. Image: ${REGISTRY}/${FLY_APP}:latest"
echo "[build] The rotation engine will pull this on every provision cycle."
