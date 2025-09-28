#!/usr/bin/env bash
set -euo pipefail
BUILD_ID=${1:-dev}
DEVICE_CLASS=${2:-ios-simulator}
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

echo "[run-ios] build_id=${BUILD_ID} device_class=${DEVICE_CLASS}"
echo "[run-ios] Starting AR-HUD demo hole (simulated)."
echo "[run-ios] TODO: Replace with actual iOS launch script once app scaffolding exists."