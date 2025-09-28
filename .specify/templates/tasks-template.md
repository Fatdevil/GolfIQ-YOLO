# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), research.md, data-model.md, simulation specs, telemetry checklist

## Execution Flow (main)
```
1. Load plan.md from feature directory
   -> If not found: ERROR "No implementation plan found"
   -> Extract: supported scope, SLOs, telemetry requirements, device matrix
2. Load optional design documents:
   -> data-model.md: anchor definitions, transform math
   -> simulation specs: synthetic camera paths, jitter, drift, latency scenarios
   -> research.md: environment assumptions, thermal limits, offline behaviour
   -> telemetry checklist: metrics, logs, sampling rates, dashboard ownership
3. Build the Constitution Check from plan.md so every principle (performance, accuracy, reliability, UX, security/privacy, observability, quality gates, testing, interoperability, developer experience, release criteria, terminology) maps to explicit tasks.
4. Generate task categories:
   - Setup & tooling
   - Tests (unit + simulation)
   - Device implementation (iOS, Android, or other clients)
   - Observability & telemetry
   - Field validation & SLO verification
   - Compliance & release readiness
5. Enforce sequencing:
   -> Tests before implementation
   -> Instrumentation before field validation
   -> Field validation before release packaging
6. Assign coverage and lint gates (>=85% line coverage, zero lint errors, <=5 warnings).
7. Number tasks sequentially (T001, T002, ...).
8. Generate dependency graph.
9. Create parallel execution examples (only when files differ and no dependency).
10. Validate completeness: tasks cover SLOs, telemetry, golden screenshots, privacy, and release sign-offs.
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **iOS app**: `ios/` (e.g., `ios/App/`, `ios/Tests/`)
- **Android app**: `android/app/src/` (e.g., `android/app/src/main/java/`, `android/app/src/test/java/`)
- **Shared assets**: `shared/`, `data/demo-hole/`, `artifacts/golden/`
- Adjust paths per plan.md if the project uses `mobile/` or other roots

## Phase 3.1: Setup & Tooling
- [ ] T001 Ensure `make run-ios` and `make run-android` launch the demo hole end-to-end (update `Makefile` and `scripts/run_*.sh` as required).
- [ ] T002 [P] Pin toolchains and dependency versions (Swift, Gradle, npm, etc.) and record them in `docs/toolchains.md`.
- [ ] T003 [P] Stage sample hole data and golden assets under `data/demo-hole/` and `artifacts/golden/README.md` per plan assumptions.

## Phase 3.2: Tests First (Unit + Simulation) — MUST COMPLETE BEFORE 3.3
- [ ] T004 Add HUD math unit tests in `ios/Tests/HUDMathTests.swift` (transforms, projections, distance math) so they fail initially.
- [ ] T005 [P] Mirror HUD math unit tests in `android/app/src/test/java/[package]/HudMathTests.kt`.
- [ ] T006 [P] Create simulation suite for camera paths, jitter, drift, and latency in `tests/simulations/test_camera_paths.py`.
- [ ] T007 [P] Add battery and cold-start simulation harness in `tests/simulations/test_performance_budget.py` (records fps, latency, battery projections).
- [ ] T008 Generate golden screenshot baselines for primary HUD states at three font scales in `tests/golden/hud_states/`.

## Phase 3.3: Device Implementation (ONLY after tests are failing)
- [ ] T009 Implement AR-HUD overlay pipeline with guardrails (ZIP/video limits, anchor persistence) in `ios/App/HUDOverlayView.swift`.
- [ ] T010 [P] Implement equivalent overlay pipeline in `android/app/src/main/java/[package]/HudOverlayView.kt` with identical guardrails.
- [ ] T011 Integrate CaddieCore v1 read-only client with 200 ms timeout and graceful degradation in `shared/caddie_core_client.py` (or platform-specific services).
- [ ] T012 Wire downgrade to 2D compass view with auto-recovery when tracking improves in `shared/state/HudFallbackController.ts` (adjust extension per platform).
- [ ] T013 Maintain offline continuity badge and cached hole data in `shared/state/OfflineStore.ts`.

## Phase 3.4: Observability & Telemetry
- [ ] T014 Emit required session metrics (session_count, session_duration, fps_avg, fps_p10, latency_ms_p50/p90, tracking_quality_p50, anchor_resets, thermal_warnings, fallback_events) in `shared/telemetry/metrics.ts`.
- [ ] T015 [P] Add structured JSON logging with build_id/device_class in `shared/telemetry/logger.ts`.
- [ ] T016 [P] Implement performance trace sampling (<=10% sessions) with opt-out controls in `shared/telemetry/tracing.ts`.
- [ ] T017 [P] Expose telemetry dashboards or config in `docs/telemetry.md` referencing owners and alert thresholds.

## Phase 3.5: Field Validation & Performance
- [ ] T018 Execute device matrix tests (2 Android + 2 iOS reference devices) using `tests/device/run_matrix.md`, capturing fps, latency, jitter, drift, thermal, cold start, battery data.
- [ ] T019 [P] Conduct field validation (tee, fairway walk, approach) with logs stored in `tests/field/2025-<date>-run.md` and attach telemetry exports.
- [ ] T020 [P] Update golden screenshots for each font scale and compare with `tests/golden/hud_states/` baselines.
- [ ] T021 [P] Document thermal warnings and battery deltas in `docs/perf/battery_thermal.md` (15-minute session evidence).

## Phase 3.6: Compliance & Release
- [ ] T022 Verify coverage >=85% lines (ios + android + shared) and archive reports under `artifacts/coverage/README.md`.
- [ ] T023 [P] Run lint/format suites (SwiftLint, ktlint, eslint, etc.) enforcing zero errors and <=5 warnings, record results in `artifacts/lint/summary.md`.
- [ ] T024 [P] Update license manifest `docs/licenses.md` ensuring no GPL-only packages and noting new dependencies.
- [ ] T025 Prepare privacy review packet in `docs/privacy/review.md` showing on-device data handling and telemetry anonymization.
- [ ] T026 Record PM + QA field checklist sign-off and release readiness in `docs/release-checklist.md` (include telemetry sampling verification).

## Dependencies
- Tests (T004-T008) must precede implementation (T009-T013).
- Telemetry instrumentation (T014-T017) must complete before field validation (T018-T021).
- Field validation evidence (T018-T021) must exist before compliance tasks (T022-T026) close.

## Parallel Example
Task: "Add HUD math unit tests in ios/Tests/HUDMathTests.swift" (T004)  
Task: "Mirror HUD math unit tests in android/app/src/test/java/[package]/HudMathTests.kt" (T005)  
Task: "Create simulation suite for camera paths..." (T006)  
Task: "Add battery and cold-start simulation harness..." (T007)

## Validation Checklist
- [ ] Every constitution principle has at least one task mapping to it (scope, performance, accuracy, reliability, UX, privacy, observability, quality gates, testing, interoperability, developer experience, release criteria, terminology).
- [ ] Tests precede implementation and fail before code changes.
- [ ] Telemetry tasks emit all required metrics, logs, and sampling controls.
- [ ] Field validation covers device matrix and on-course scenarios with captured evidence.
- [ ] Coverage >=85% and lint zero errors (<=5 warnings) with reports archived.
- [ ] Golden screenshots and degraded-mode behaviour are validated and stored.
- [ ] Privacy review, license manifest, and PM/QA sign-offs are tracked in docs.
