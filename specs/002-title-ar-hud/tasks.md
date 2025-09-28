# Tasks: AR-HUD v1 on-course HUD

Legend
- Format: `ID [P?] Description - Acceptance`
- `[P]` = can run in parallel (no file or logical dependency)
- All tasks must include tests or evidence where noted

## PHASE 0 - Project setup and scaffolding
- [X] T001 Setup make targets - Update `Makefile`, `scripts/run_ios.sh`, and `scripts/run_android.sh` so `make run-ios` / `make run-android` launch the demo hole and print `build_id` + `device_class` on start. - Running either target boots the demo hole without errors and prints identifiers.
- [X] T002 Pin toolchains - Document pinned Xcode/SDK/NDK/Gradle/node versions in `docs/toolchains.md` and lock config files. - Reproducible CI build hashes match local builds.
- [X] T003 Seed demo assets - Populate `data/demo-hole/` with sample pin/layup GPS and create `artifacts/golden/README.md`. - Files present and README lists regeneration steps.

## PHASE 1 - Tests first (unit)
- [X] T010 [P] Unit math (iOS) - Add failing tests for transforms/projections/distance clamps in `ios/Tests/HUDMathTests.swift`. - Tests fail before T030 and pass after implementation.
- [X] T011 [P] Unit math (Android) - Mirror T010 in `android/app/src/test/java/com/golfiq/hud/HudMathTests.kt`. - Same behaviour as iOS suite.
- [X] T012 [P] Unit anchor confidence - Add tests in `tests/unit/test_anchor_confidence.py` verifying confidence increases with stability and decreases with variance/time. - Confidence monotonicity checks pass after GroundFitter integration.
- [X] T013 [P] Unit revalidation policy - Add tests in `tests/unit/test_revalidation_policy.py` covering thresholds (0.20 m, 0.8 deg, trackingQuality < medium, heartbeat >= 0.5 s), debounce 2 frames, cap <= 10 validations per second. - All rules verified once controllers implemented.

## PHASE 2 - Simulation suites
- [X] T020 [P] Simulation camera paths - Implement `tests/simulations/test_camera_paths.py` to exercise pan/walk/jitter and export drift & latency traces. - Traces saved and asserts keep drift < 0.5 m (30 s) with stable anchors.
- [X] T021 [P] Performance budget sim - Implement `tests/simulations/test_performance_budget.py` estimating fps_avg, latency p50/p90, and cold start. - Budget asserts present and pass on reference profiles.
- [X] T022 Golden screenshots baseline - Create baseline images under `tests/golden/hud_states/` with compare harness configured. - Baselines exist; compare tool passes after HUD compositor work.

## PHASE 3 - Client implementation (after Phase 1 tests exist)
- [X] T030 PoseAdapter (iOS) - Implement `ios/Services/PoseAdapter.swift` wrapping ARKit pose, intrinsics, tracking quality, timestamps. - Unit suites compile; PoseAdapter returns pose & quality fields consumed by tests.
- [X] T031 [P] PoseAdapter (Android) - Implement `android/app/src/main/java/com/golfiq/hud/pose/PoseAdapter.kt` for ARCore. - Android unit tests pass.
- [X] T032 GroundFitter core - Implement `ios/Services/GroundFitter.swift` and `android/app/src/main/java/com/golfiq/hud/pose/GroundFitter.kt` with RANSAC + EMA smoothing and confidence metric. - Anchor tests from T012/T013 pass.
- [X] T033 Anchor revalidation policy - Wire policy thresholds/heartbeat/debounce in controllers (`ios/Services/AnchorRevalidator.swift`, Android equivalent). - Policy tests from T013 pass.
- [X] T034 DistanceResolver - Implement distance computation with GPS clamp & EMA smoothing (`ios/Services/DistanceResolver.swift`, `android/app/src/main/java/com/golfiq/hud/distance/DistanceResolver.kt`). - Distance clamp tests succeed.
- [X] T035 HudCompositor - Render reticle, pin/layups, target line, wind hint, badges in `ios/App/HUDOverlayView.swift` and Android counterpart; enforce safe FOV and sunlight theme. - Golden comparison after T022 passes.
- [X] T036 GestureController - Implement tap/long-press/swipe gestures (`ios/Services/GestureController.swift`, Android equivalent). - Manual tests plus gesture unit hooks pass.
- [X] T037 FallbackController - Implement trackingQuality watchdog with auto compass recovery (`ios/Services/FallbackController.swift`, Android counterpart). - Simulation fallback tests pass.
- [X] T038 PerfOverlay - Implement developer overlay toggled via three-finger tap (`ios/Debug/PerfOverlay.swift`, Android debug). - Overlay visible in debug and disabled in release builds.
- [X] T039 CaddieCore client - Implement read-only client wrappers (`ios/Services/CaddieCoreClient.swift`, `android/app/src/main/java/com/golfiq/hud/network/CaddieCoreClient.kt`, optional `shared/caddie_core_client.py` for mocks) honoring 200 ms timeout & graceful fallback. - Contract tests from T008 pass.

## PHASE 4 - Data & telemetry models (can run alongside Phase 3)
- [X] T040 [P] Session & anchor models - Implement data models from `data-model.md` in iOS (`ios/Models/*`) and Android (`android/app/src/main/java/com/golfiq/hud/model/*`). - Unit coverage confirms serialization and stability fields.
- [X] T041 [P] Cached hole & feature flags - Implement persistence/config modules (`shared/cache/CachedHoleStore.ts`, platform stores, feature flag loaders). - Offline tests and flag toggles succeed.
- [X] T042 [P] Telemetry sample modules - Implement shared telemetry types and sampling metadata (`shared/telemetry/TelemetrySample.ts`, platform wrappers). - Telemetry tests ensure schema compliance.

## PHASE 5 - Telemetry and logging
- [X] T050 Metrics emitter - Wire metrics pipeline emitting session_count, session_duration_s, fps_avg, fps_p10, hud_latency_ms_p50/p90, tracking_quality_p50, anchor_resets_count, thermal_warnings_count, fallback_events_count (iOS/Android + `shared/telemetry/metrics.ts`). - Metrics visible in logs/dashboards; unit tests cover payload.
- [X] T051 [P] Structured logger - Implement JSON logging with build_id/device_class redaction guards (`shared/telemetry/logger.ts`, platform log sinks). - Log sampling/redaction tests pass.
- [X] T052 [P] Trace sampling - Implement <= 10 percent sampling with remote toggle (`shared/telemetry/tracing.ts`, platform hooks). - Sampling tests validate limits.

## PHASE 6 - Device matrix runs
- [X] T060 Device run guide - Flesh out `tests/device/run_matrix.md` with steps for iPhone14/15 and Pixel7/8. - Checklist committed with instructions.
- [ ] T061 iOS device run - Execute guide, capture telemetry/logs/screenshots stored under `artifacts/device/ios/`. - All plan SLOs met with evidence.
- [ ] T062 [P] Android device run - Execute guide for Pixel devices, storing outputs under `artifacts/device/android/`. - SLOs met; evidence attached.

## PHASE 7 - Field validation (outdoor daylight)
- [ ] T070 Tee box run - Document tee scenario in `tests/field/2025-<date>-tee.md` with screenshots and telemetry export. - All SLOs pass; evidence committed.
- [ ] T071 [P] Fairway walk run - Record 30 s walk in `tests/field/2025-<date>-fairway.md` confirming drift < 0.5 m. - Evidence attached.
- [ ] T072 [P] Approach run - Document approach scenario in `tests/field/2025-<date>-approach.md` showing stability/latency metrics. - Evidence attached.

## PHASE 8 - Battery, thermal, accessibility
- [ ] T080 Battery & thermal report - Populate `docs/perf/battery_thermal.md` with 15 minute session data and thermal warnings. - Report within <= 9 percent drain and logged warnings.
- [ ] T081 Accessibility audit - Checklist in `docs/accessibility/ar-hud.md` covering WCAG AA contrast, font scaling 130 percent, one-handed reach. - Signed checklist committed.

## PHASE 9 - Flags, offline, safety
- [ ] T090 Feature flags wiring - Ensure `hud_wind_hint`, `hud_target_line`, `hud_battery_saver` defaults and overrides function; add tests in `tests/integration/test_feature_flags.py`. - Toggle tests show correct behaviour.
- [ ] T091 Offline continuity - Implement and verify caching/offline badge/silent resync (`tests/integration/test_offline_continuity.py`). - Offline tests pass.
- [ ] T092 Safety prompts - Implement Heads-up banner scheduling and FOV guard; add timer tests in `ios/Tests/SafetyPromptTests.swift` and Android counterpart. - Safety tests pass.

## PHASE 10 - Docs and dashboards
- [ ] T100 Telemetry doc - Update `docs/telemetry.md` with metric list, owners, Grafana links. - Doc reviewed; links valid or TODO noted.
- [ ] T101 [P] Quickstart/README updates - Update `README.md` AR-HUD section and refresh `specs/002-title-ar-hud/quickstart.md`. - CI build/run instructions verified locally.
- [ ] T102 [P] Licence manifest - Ensure `docs/licenses.md` includes new deps; verify no GPL-only packages. - Manifest passes compliance review.

## PHASE 11 - CI and quality gates
- [ ] T110 Lint & format - Configure CI lint for SwiftLint/ktlint/eslint; capture results in `artifacts/lint/summary.md` with <= 5 warnings. - CI green with recorded summary.
- [ ] T111 Coverage gate - Ensure >= 85 percent core coverage, archive to `artifacts/coverage/README.md`. - CI fails if under gate; report attached.
- [ ] T112 Bundle budget - Add per-platform bundle size check (<= 20 MB growth) recorded in `artifacts/bundle/summary.md`. - Gate green with report.

## PHASE 12 - Release readiness and rollback
- [ ] T120 Release checklist - Fill `docs/release-checklist.md` with PM/QA sign-off, privacy review, telemetry sampling status. - Checklist signed and committed.
- [ ] T121 [P] Tag and notes - Create tag `ar-hud-v1`, draft GitHub Release with evidence links. - Release published.
- [ ] T122 [P] Rollback plan - Document flag kill-switch and store rollback steps in `docs/rollback/ar-hud.md`; validate in staging. - Plan verified.

## Dependencies
- T001 precedes all tasks.
- T002-T003 before tests requiring assets/docs.
- T010-T013 must fail (then pass) before T030+ implementation.
- T020-T022 generate baselines prior to compositor validation.
- Data/telemetry models (T040-T042) feed into implementation and metrics tasks.
- Telemetry tasks (T050-T052) complete before device/field validations (T060-T072).
- Field validation requires core implementation (T030-T039, T040-T042) and telemetry (T050-T052).
- Compliance/release tasks (T100+) run after validation evidence collected.

## Parallel Examples
Run these Task agent commands in parallel once T002 completes:
- `task run T010`
- `task run T011`
- `task run T020`
- `task run T021`

Additional safe parallel sets:
- `task run T050`, `task run T051`, `task run T052`
- `task run T061`, `task run T062`
- `task run T121`, `task run T122`

## Acceptance Evidence (attach to PR)
- Unit, simulation, device, and field test reports.
- Golden screenshot comparisons.
- Coverage and lint reports.
- Telemetry dashboard screenshot(s).
- Battery/thermal report.
- Privacy review note and updated licence manifest.
