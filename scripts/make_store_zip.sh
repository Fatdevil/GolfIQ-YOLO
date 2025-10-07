#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
SCREENS_DIR="$DIST_DIR/screens"
ZIP_PATH="$DIST_DIR/store_v1.2.zip"
RELEASE_NOTES="$ROOT_DIR/RELEASE_NOTES_v1.2.md"

mkdir -p "$DIST_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

WORK_DIR="$TMP_DIR/store_assets"
mkdir -p "$WORK_DIR"

if [[ -d "$SCREENS_DIR" ]]; then
  if compgen -G "$SCREENS_DIR/*" > /dev/null; then
    mkdir -p "$WORK_DIR/screens"
    cp "$SCREENS_DIR"/* "$WORK_DIR/screens/"
  else
    echo "[store:zip] Warning: dist/screens is empty" >&2
  fi
else
  echo "[store:zip] Warning: dist/screens directory missing" >&2
fi

for asset in "apple_privacy.json" "play_datasafety.json"; do
  if [[ -f "$DIST_DIR/$asset" ]]; then
    cp "$DIST_DIR/$asset" "$WORK_DIR/"
  else
    echo "[store:zip] Warning: missing $asset" >&2
  fi
done

if [[ -f "$RELEASE_NOTES" ]]; then
  cp "$RELEASE_NOTES" "$WORK_DIR/"
else
  echo "[store:zip] Warning: RELEASE_NOTES_v1.2.md not found (continuing)" >&2
fi

rm -f "$ZIP_PATH"
(
  cd "$WORK_DIR"
  if compgen -G "*" > /dev/null; then
    zip -r "$ZIP_PATH" . >/dev/null
    echo "[store:zip] Created $ZIP_PATH"
  else
    echo "[store:zip] Warning: no assets found; creating empty archive" >&2
    zip -r "$ZIP_PATH" . >/dev/null
  fi
)

exit 0
