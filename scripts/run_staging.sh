#!/usr/bin/env bash
set -euo pipefail
export STAGING=1
exec uvicorn server.app:app --host 0.0.0.0 --port 8000
