#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f server/.env ] && . server/.env || true
set +a
python -m pip install --upgrade pip
pip install -r server/requirements.txt -q
uvicorn server.api.main:app --host 0.0.0.0 --port 8000 --reload
