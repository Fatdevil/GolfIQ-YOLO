# Implementation Plan: AR-HUD v1 on-course HUD

**Branch**: `002-title-ar-hud` | **Date**: 2025-09-24 | **Spec**: C:/Users/stell/GolfIQ-YOLO/specs/002-title-ar-hud/spec.md
**Input**: Feature specification from `C:/Users/stell/GolfIQ-YOLO/specs/002-title-ar-hud/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   -> If not found: ERROR "No feature spec at C:/Users/stell/GolfIQ-YOLO/specs/002-title-ar-hud/spec.md"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   -> Detect Project Type from context (mobile = iOS + Android)
   -> Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   -> If violations exist: Document in Complexity Tracking
   -> If no justification possible: ERROR "Simplify approach first"
   -> Update Progress Tracking: Initial Constitution Check (PASS)
5. Execute Phase 0 -> research.md
   -> If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 -> contracts, data-model.md, quickstart.md, agent-specific template file.
7. Re-evaluate Constitution Check section
   -> If new violations: Refactor design, return to Phase 1
   -> Update Progress Tracking: Post-Design Constitution Check (PASS)
8. Plan Phase 2 -> Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
AR-HUD v1 delivers on-device augmented distance guidance for golfers on iPhone 14/15 and Pixel 7/8. The plan implements shared pose/anchor modules, CaddieCore read-only integrations with 200 ms timeouts, anchor re-validation on pose deltas, fallback compass mode, telemetry collection, and constitutional SLO instrumentation (fps, latency, drift, battery, thermal). Thermal safeguards, offline continuity, and feature-flag defaults are enforced across iOS and Android builds.

## Architecture Overview
### Client Modules
- **PoseAdapter**: Wraps ARKit/ARCore pose, camera intrinsics, and tracking quality; outputs rotation/translation plus frame timestamps for downstream consumers.
- **GroundFitter**: Estimates the ground plane, maintains pin/layup anchors with stability scores, and re-validates anchors when pose delta exceeds the movement threshold or trackingQuality drops below "good" for two consecutive frames.
- **DistanceResolver**: Computes geodesic and planar distances to pin/layups using fused device GPS + cached targets; clamps outputs by GPS accuracy and anchor confidence.
- **HudCompositor**: Renders reticle, markers, target line, wind hint, offline/fallback badges, enforcing sunlight-readable theme and safe FOV rules (centre 8% clear).
- **GestureController**: Handles tap (set/adjust reticle), long-press (re-centre/re-capture ground plane), and swipe (cycle overlays or toggle target line).
- **FallbackController**: Switches to 2D compass mode when trackingQuality < threshold for >2 seconds and auto-recovers when stability returns.
- **PerfOverlay**: Developer-only toggle via three-finger tap showing fps, latency p50/p90, tracking quality, thermal hints, and anchor drift metrics.
- **TelemetryClient**: Sends anonymised metrics/logs respecting <=10% sampling, batching with offline buffering.
- **FeatureFlags**: Surfaces `hud_wind_hint`, `hud_target_line`, and `hud_battery_saver` defaults and remote overrides.

### Optional Server Modules (v1 Minimal)
- **FeatureFlags API** (`GET /feature-flags/hud`): Provides remote overrides for HUD feature flags.
- **Telemetry Collector**: Accepts anonymised telemetry batches and forwards to Grafana/Prometheus pipelines; optional for v1 (local logs remain available if deferred).
- **CaddieCore v1** (existing service): `GET /caddie/suggest` and `GET /caddie/targets` read-only endpoints with 200 ms timeout contracts and fallback guidance.

## Data Flow
1. Camera frames -> PoseAdapter -> GroundFitter -> DistanceResolver -> HudCompositor for rendering HUD overlays.
2. CaddieCore v1 responses -> DistanceResolver (club suggestions) -> HudCompositor for club display.
3. FeatureFlags (local defaults or remote API) -> HudCompositor / controllers to enable or suppress wind hint, target line, battery saver behaviours.
4. TelemetryClient captures metrics/logs from PoseAdapter, GroundFitter, HudCompositor, and FallbackController, batching to local storage and optional telemetry collector.

## Technical Context
**Language/Version**: Swift 5.9 (iOS 17+), Kotlin (Android 14+), Python 3.11 for telemetry tooling  
**Primary Dependencies**: ARKit 6, ARCore 1.40, Metal/SceneKit rendering, Jetpack Compose UI, Retrofit/URLSession, Grafana/Prometheus exporters  
**Storage**: On-device JSON cache + CoreData/Room wrapper for last hole and telemetry buffer  
**Testing**: XCTest + XCUITest, JUnit5 + Espresso + Macrobenchmark, pytest for simulation harness  
**Target Platform**: Dual mobile (iOS + Android)  
**Project Type**: mobile  
**Performance Goals**: >=30 fps camera (target 45), <=120 ms HUD latency, <1.0 deg jitter, <0.5 m drift, <=3.0 s cold start, <=9% battery / 15 min, sustain 15 min without thermal shutdown  
**Constraints**: CaddieCore read-only calls <=200 ms with graceful degradation, daylight-only usability at 75% brightness, offline continuity per hole, zero GPL-only deps  
**Scale/Scope**: Single golfer sessions per device; telemetry batches <=10% sampling routed to AR-HUD v1 dashboard

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Purpose & Scope**: ✔ Covered via supported module list (PoseAdapter, GroundFitter, DistanceResolver, HudCompositor, GestureController, FallbackController, PerfOverlay) with out-of-scope items deferred to backlog.
- **Performance & Latency**: ✔ Plan codifies device matrix (iPhone 14/15, Pixel 7/8), fps/latency instrumentation, cold start, drift, jitter, battery, and thermal logging baked into PerfOverlay + telemetry.
- **Accuracy & Anchoring**: ✔ GroundFitter re-validates anchors on pose delta thresholds; DistanceResolver clamps errors to <2 m; anchors tracked for 95% persistence.
- **Reliability & Fallbacks**: ✔ FallbackController auto-switches to compass mode after 2 s degraded tracking; offline cache + badge maintained; crash-free target enforced via soak/device testing.
- **UX & Accessibility**: ✔ HUD theme enforces WCAG AA at 75% brightness, centre 8% FOV clear, gestures reachable one-handed, font scaling to 130%, safety banners scheduled every 20 minutes.
- **Security & Privacy**: ✔ No raw frames/location leave device without consent; secrets stored in platform keychains; telemetry anonymised with consent gating; permissions time-scoped.
- **Observability & Telemetry**: ✔ Metrics set (session_count, fps_avg/p10, latency p50/p90, tracking_quality_p50, anchor_resets, thermal_warnings, fallback_events); structured logs include build_id/device_class; <=10% trace sampling; Grafana AR-HUD v1 dashboard owners documented.
- **Quality Gates**: ✔ Coverage >=85% across shared modules; lint (SwiftLint/ktlint/eslint) zero errors <=5 warnings; deterministic builds via pinned SDK/toolchain; licence manifest updates tracked.
- **Testing Strategy**: ✔ Unit (math/projections), simulation (camera paths, jitter, latency, battery), device matrix (2 iOS + 2 Android), field runs (tee/fairway/approach) with logs + screenshots, golden HUD states across font scales.
- **Interoperability**: ✔ CaddieCore GET `/caddie/suggest` and `/caddie/targets` wrapped with timeout + fallback; FeatureFlags endpoint provides defaults; telemetry collector batches anonymised payloads.
- **Developer Experience**: ✔ `make run-ios` / `make run-android` launch demo hole with mocked telemetry; sample hole data shipped; PerfOverlay toggled with three-finger tap.
- **Release Criteria**: ✔ DoD enforces SLO evidence, zero P0/P1 open, PM/QA sign-offs, privacy review, telemetry sampling guardrails prior to release.
- **Terminology & Clarity**: ✔ HUD, anchor, drift, pose delta definitions applied consistently; glossary aligned with constitution.

Initial Constitution Check: PASS

## Phase 0: Research (research.md)
**Focus**: Confirm device/OS baselines, anchor management strategy, CaddieCore degradation path, telemetry/flag delivery, and build determinism. Decisions recorded in `research.md` cover:
- Platform SDK versions and thermal guardrails.
- PoseAdapter abstractions for ARKit/ARCore with shared math utilities.
- Anchor re-validation thresholds and drift monitoring cadence.
- CaddieCore API clients with resilient timeout handling and offline cache usage.
- Feature flag + telemetry transport (optional server) and privacy posture.

## Phase 1: Design & Contracts
Artifacts produced:
- `data-model.md`: Entities for HUDSession, Anchor, OverlayElement, TelemetrySample, DeviceProfile, FeatureFlagConfig, CachedHole, and relationships.
- `contracts/caddiecore.yaml`: OpenAPI snippets for GET `/caddie/suggest` and `/caddie/targets` with timeout + fallback semantics.
- `contracts/feature-flags.yaml`: JSON schema for feature flag bootstrap, including defaults.
- `contracts/telemetry-batch.json`: JSON schema for anonymised telemetry payloads.
- `quickstart.md`: Developer walkthrough to run demo hole, enable PerfOverlay, collect telemetry, and validate fallback behaviour across devices.
- Agent context refreshed via `.specify/scripts/powershell/update-agent-context.ps1 -AgentType codex` capturing new tech (ARKit/ARCore, PerfOverlay tooling).

Post-Design Constitution Check: PASS (no violations introduced).

## Phase 2: Task Planning Approach
/Tasks will:
- Parse data-model and contracts to generate unit, simulation, device, and integration test tasks before implementation.
- Enforce TDD sequencing (math + simulation tests → shared modules → platform implementations → observability wiring → field validation → compliance artefacts).
- Ensure telemetry instrumentation and Grafana dashboard updates precede field runs.
- Include gating tasks for coverage, lint, bundle size, licence manifest, privacy review, and PM/QA sign-off.

## Phase 3+: Future Implementation
- **Phase 3**: /tasks command produces ordered T00x list across Setup, Tests, Device Implementation, Telemetry, Field Validation, Compliance.
- **Phase 4**: Engineering executes tasks, implements modules, and maintains anchor/runtime standards.
- **Phase 5**: Validation run (unit, simulation, device matrix, field logs/screenshots, telemetry dashboards, privacy review) prior to release.

## Complexity Tracking
_No deviations from constitution required._

## Progress Tracking
**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [ ] Complexity deviations documented (not required)

---
*Based on Constitution v0.2.0 - See `.specify/memory/constitution.md`*
## External Interfaces
### CaddieCore v1 (Read-only, 200 ms timeout, graceful degradation)
- `GET /caddie/targets?hole_id={id}` - returns pin_gps (lat, lon) and layups (name plus gps lat/lon) for caching.
- `GET /caddie/suggest?lie={tee|fairway|rough|approach}&distance_m={float}` - returns club recommendation, conservative alternative, confidence, and reasoning factors.

### Feature Flags Service (Optional)
- `GET /feature-flags/hud` - returns overrides for `hud_wind_hint`, `hud_target_line`, `hud_battery_saver`; clients default to ON when 204.

### Telemetry Collector (Optional)
- `POST /telemetry/hud` - accepts batches defined in `contracts/telemetry-batch.json`; retries deferred when offline.

## Device Services
- Camera and AR frameworks: ARKit (iOS) and ARCore (Android).
- Coarse location / GPS (prompt permission on feature use).
- Thermal status monitors for platform hints / throttling.

## Algorithms & Policies
### Ground Plane Fit
- Use RANSAC-based plane estimation with exponential moving average smoothing over recent frames.
- Reject plane when variance exceeds threshold or trackingQuality < medium.
- Anchor confidence computed from plane variance, trackingQuality, and time since last reset.

### Anchor Revalidation (from Clarifications)
Trigger revalidation when any condition is true:
- deltaPosition >= 0.20 m since last commit.
- deltaRotation >= 0.8 deg (max Euler axis).
- trackingQuality < medium.
- Heartbeat >= 0.5 s since last revalidation (slow drift guard).

Additional guards:
- Debounce for 2 frames.
- Cap at <=10 validations per second.

### Distance Calculation
- Primary: great-circle distance between device GPS and target GPS.
- When anchor confidence is high, adjust by camera-pose projected range.
- Clamp distance by GPS accuracy radius; present integer meters with EMA(0.7) damping to reduce oscillation.

### Target Line
- Derive heading from device forward vector projected onto ground plane.
- Fade line beyond 80 m.
- Snap to pin bearing when golfer taps "Aim".

### Wind Hint
- Qualitative tiers: calm, breeze, windy (hide when unavailable).
- Example mapping: speed_mps <2 -> calm, <6 -> breeze, else -> windy.

## UX & Safety
- Sunlight-readable theme meeting WCAG AA at 75% brightness.
- Keep centre 8% of FOV clear of persistent overlays.
- Display "Heads up" safety banner on first launch and every 20 minutes.
- Ensure controls reachable one-handed on 6.7" devices; respect OS font scaling up to 130%.

## Performance & Resource Budgets
- Preview FPS: >=30 (target 45).
- HUD latency (pose to draw): <=120 ms p90.
- Pose jitter: <1.0 deg RMS at 60 cm over 3 s.
- Drift: <0.5 m over 30 s walk at 1.2 m/s.
- Thermal: sustain 15-minute AR session without shutdown; log warnings.
- Cold start to first AR frame: <=3.0 s.
- Battery impact: <=9% per 15-minute session at 75% brightness.

## Telemetry, Logging & Sampling
- Metrics per session: session_count, session_duration_s, fps_avg, fps_p10, hud_latency_ms_p50, hud_latency_ms_p90, tracking_quality_p50, anchor_resets_count, thermal_warnings_count, fallback_events_count.
- Structured JSON logs include build_id, device_class, sampling markers; exclude raw frames/PII.
- Detailed performance traces limited to <=10% sessions (remote flag configurable).

## Privacy & Security
- Keep frames and precise location on-device unless explicit consent granted.
- Telemetry anonymised with no PII.
- Request camera/coarse location permissions only when HUD launches.
- Secrets sourced from env/secure store when server components used.

## Battery Saver Mode
When `hud_battery_saver` enabled or battery drops below threshold:
- Relax revalidation heartbeat to 0.75 s.
- Reduce target line segment density.
- Disable wind hint (if flagged) and PerfOverlay sampling.
- Engage frame-rate adaptive rendering when fps <28.

## Offline Continuity
- Cache current hole and targets; display Offline badge during connectivity gaps.
- Maintain HUD overlays and resynchronise silently once network returns.

## Build, Tooling & Paths
- `make run-ios` / `make run-android` launch demo hole with test targets.
- Toolchains pinned for deterministic builds.
- Suggested repository paths:
  - iOS: `ios/App/HUDOverlayView.swift`, `ios/Services/PoseAdapter.swift`.
  - Android: `android/app/src/main/java/.../HudOverlayView.kt`, `.../PoseAdapter.kt`.
  - Shared telemetry: `shared/telemetry/metrics.ts`, `shared/telemetry/logger.ts`, `shared/telemetry/tracing.ts`.

## Test Assets & Documentation
- Golden visual assets: `artifacts/golden/`, `tests/golden/hud_states/`.
- Simulation tests: `tests/simulations/test_camera_paths.py`, `tests/simulations/test_performance_budget.py`.
- Documentation: `docs/telemetry.md`, `docs/perf/battery_thermal.md`, `tests/device/run_matrix.md`.

## Test Strategy
- **Unit**: Validate math transforms, projections, distance clamps, anchor confidence calculations.
- **Simulation**: Scripted camera paths covering jitter, drift, latency, and battery/cold-start projections.
- **Device Matrix**: Two iOS (iPhone 14/15) and two Android (Pixel 7/8) reference devices with golden runs recorded.
- **Field**: Tee, fairway walk, and approach scenarios with logs and screenshots captured.
- **Visual Baselines**: Golden screenshots for main HUD states at three font scales.

## Constitution Check (Gate)
- **Scope Discipline**: Only v1 features implemented; out-of-scope items tracked separately.
- **Performance & Latency**: Budgets from Performance section measured via tests.
- **Accuracy & Anchoring**: Distance error <=2.0 m (30-200 m), 95% anchors within 0.5 m after 30 s slow pan.
- **Reliability & Fallbacks**: >=99.5% crash-free, fallback after >2 s degraded tracking with auto-recovery.
- **UX & Accessibility**: WCAG AA compliance, one-handed reach, 130% font scaling, safe FOV centre maintained.
- **Security & Privacy**: Frames/location remain on-device; telemetry anonymised.
- **Observability & Telemetry**: Metrics in Telemetry section emitted; sampling <=10%.
- **Quality Gates**: Coverage >=85%, lint zero errors (<=5 warnings), bundle growth <=20 MB, deterministic builds, GPL-free licence manifest.
- **Testing**: Unit/simulation/device/field/golden coverage required before release.
- **Interoperability**: CaddieCore v1 read-only with 200 ms timeout and graceful degradation.
- **Developer Experience**: `make run-ios` / `make run-android`; PerfOverlay toggle accessible.
- **Release Criteria**: SLO proof on reference devices, no P0/P1 issues, PM+QA sign-off, privacy review complete.

## Migration & Rollback
- Migration: Not applicable (net-new feature).
- Rollback: Disable via feature flag, app store rollback to prior release, disable server overrides if applicable.
- Telemetry dashboards updated before enabling default-on rollout.

## Risks & Mitigations
- **Thermal throttling in sunlight**: Budget tests, battery saver mode, reduce render density.
- **GPS inaccuracy**: Clamp outputs, surface conservative overlays, expose anchor confidence indicator.
- **Tracking loss**: Heartbeat/fallback controller with user long-press recenter guidance.
- **Battery drain**: Power budgets plus saver mode and adaptive rendering.
- **HUD clutter**: Maintain clear centre FOV, progressive overlay disclosure.

## Deliverables
- Client modules and integrations; optional server flag/telemetry services.
- Test suites: unit, simulation, device, field, golden assets.
- Documentation: `docs/telemetry.md`, `docs/perf/battery_thermal.md`, `tests/device/run_matrix.md`.
- Dashboards: Grafana "AR-HUD v1" with required metrics.

## Acceptance Evidence
- Unit/simulation/device/field test reports.
- Golden screenshots (three font scales).
- Coverage and lint summaries.
- Telemetry dashboard screenshots showing metrics.
- Privacy review note and updated licence manifest.

## Dependencies
- Reachable CaddieCore v1 endpoints (dev/staging).
- Course target feed or demo dataset for pin/layups.
- ARKit/ARCore support on reference devices.

## Feature Flags (Defaults)
- `hud_wind_hint` = on
- `hud_target_line` = on
- `hud_battery_saver` = on

## Glossary
- **HUD**: Heads-up overlay in camera view.
- **Anchor**: Persisted world-space point for overlay placement.
- **Drift**: Accumulated mismatch between virtual and real positions over time.
- **Heartbeat**: Periodic revalidation trigger to detect slow drift.

## Appendix A: Implementation Notes
- Use EMA to stabilise numeric readouts.
- Render integer meters to avoid oscillation.
- Defer non-essential overlays when fps <28 for >1 s.

## Appendix B: File Skeletons (Optional)
- `ios/App/HUDOverlayView.swift`
- `android/app/src/main/java/.../HudOverlayView.kt`
- `tests/simulations/test_camera_paths.py`
- `tests/golden/hud_states/` placeholders
