# Quickstart — AR-HUD v1 on-course HUD

## Prerequisites
- macOS with Xcode 15.2 (Swift 5.9) for iOS builds.
- Android Studio Giraffe with Android 14 SDK + NDK 26 for Pixel builds.
- Python 3.11 with `pip install -r requirements-dev.txt` for simulation harness.
- Access to CaddieCore staging (read-only) and feature-flag/telemetry endpoints.

## 1. Bootstrap Environment
1. `make bootstrap` — installs pinned toolchains and shared scripts.
2. `make run-ios` — builds and launches demo hole on a connected iPhone 14/15 simulator/device with PerfOverlay enabled.
3. `make run-android` — launches demo hole on Pixel 7/8 emulator/device.

## 2. Validate Feature Flags & Telemetry
1. Confirm defaults (hud_wind_hint, hud_target_line, hud_battery_saver) are ON via `/feature-flags/hud`.
2. Trigger HUD session and verify telemetry batches in Grafana **AR-HUD v1** dashboard (session_count increments, fps_avg, latency metrics present).
3. Enable trace sampling by setting `AR_HUD_TRACE_SAMPLE=1` and confirm detailed logs limited to <=10% sessions.

## 3. Check CaddieCore Integration
1. Start a session online; ensure GET `/caddie/suggest` returns a club within 200 ms; capture response in logs.
2. Kill network for 5 seconds; observe fallback to cached suggestion and “Offline” badge.
3. Restore network; confirm silent resync and HUD updates within 1 second.

## 4. Assess Anchor Stability
1. Walk a 30-second path while recording; ensure drift <0.5 m and pose jitter <1.0 deg RMS reported in PerfOverlay.
2. Observe anchor re-validation when pose delta threshold exceeded (logged in debug console).

## 5. Field Test Checklist
1. Run tee, fairway, and approach scenarios on both iOS and Android reference devices.
2. Capture screenshots for normal HUD, fallback compass, offline badge, and Heads up safety banner.
3. Export logs + telemetry snapshots for inclusion in release evidence.

## 6. Compliance & Release Prep
1. Run `make lint` (SwiftLint, ktlint, eslint) — ensure zero errors, <=5 warnings.
2. Run `make coverage` — verify >=85% combined coverage.
3. Review bundle size delta (`scripts/check_bundle_size.sh`) — confirm <=20 MB increase per platform.
4. Update `docs/licenses.md` with any new dependencies; verify no GPL-only packages.
5. Validate App Store / Play Store metadata: no debug entitlements, correct permission text referencing camera and coarse location.

## 7. Troubleshooting
- **Timeouts**: confirm fallback cache populated and telemetry logs the timeout reason.
- **Thermal warnings**: ensure banner prompts user and PerfOverlay logs event severity; shorten session if critical.
- **Wind hint mismatch**: verify FeatureFlags endpoint state and local default toggles.

## 8. Next Steps
Proceed to `/tasks` once validation steps succeed to generate the detailed execution task list.
