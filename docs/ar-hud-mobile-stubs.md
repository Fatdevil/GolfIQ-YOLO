# AR-HUD Mobile Stubs

This repository contains lightweight stubs for the augmented reality heads-up
display (AR-HUD) mobile clients. The goal is to keep platform code present for
API reference without forcing CI to build Android or iOS artifacts.

## Layout

- `android/` — Kotlin data models and socket interface used by the Android app.
- `ios/` — Swift data models mirroring the Android payloads.
- `shared/telemetry/` — JSON schema and utilities that define the canonical
  telemetry payload.

## CI Strategy

GitHub Actions workflows are configured to ignore changes limited to `android/**`
and `ios/**`, ensuring server/web pipelines are unaffected by mobile-only edits.

## Next Steps

Future work will integrate real transport layers, live telemetry ingestion, and
platform-specific build steps once backend endpoints are finalized.
