#!/usr/bin/env bash
set -euo pipefail
BUILD_ID=${1:-dev}
DEVICE_CLASS=${2:-android-emulator}
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

echo "[run-android] build_id=${BUILD_ID} device_class=${DEVICE_CLASS}"
echo "[run-android] Starting AR-HUD demo hole (simulated)."
echo "[run-android] TODO: Replace with actual Android launch script once app scaffolding exists."