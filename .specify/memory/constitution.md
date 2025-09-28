<!--
Sync Impact Report
Version change: 0.1.1 -> 0.2.0
Modified principles:
- Core Principles rewritten for AR-HUD v1 execution (Purpose & Vision through Terminology & Clarity)
Added sections:
- Terminology & Clarity
Removed sections:
- None
Templates requiring updates:
- Updated: .specify/templates/plan-template.md (Constitution check aligns with AR-HUD SLOs)
- Updated: .specify/templates/spec-template.md (Non-functional targets updated for AR-HUD)
- Updated: .specify/templates/tasks-template.md (Task categories enforce AR-HUD testing and SLO verification)
Follow-up TODOs:
- TODO(RATIFICATION_DATE): set on first merge to main
-->

# GolfIQ-YOLO Constitution

## Core Principles

### Purpose & Vision
- AR-HUD v1 MUST provide on-course augmented overlays that surface distance-to-pin, target line, and CaddieCore v1 club suggestions with low latency and high stability in outdoor golf conditions.

*Rationale:* Aligns every decision with the product's reason for existing.

### Scope Discipline
- v1 MUST ship only the supported capabilities: phone camera AR, ground plane detection, stable reticle, distance and layup markers, target line, qualitative wind hint, CaddieCore v1 club suggestion, sunlight-readable UI theme, basic gestures (tap, long-press, swipe), and offline continuity within the current hole.
- Features declared out of scope for v1 (multi-golfer sync, AR glasses, night mode, lidar elevation, live ball-flight tracking, 3D green contours, voice control, social overlays, live scoring) MUST remain deferred with explicit tracking of follow-up work.

*Rationale:* Guarding scope prevents dilution of quality and timelines.

### Performance & Latency
- Camera preview MUST sustain >=30 fps (target 45 fps) on 2023+ midrange devices.
- HUD redraw latency from pose update to on-screen composition MUST stay <=120 ms.
- Pose stability jitter MUST remain <1.0 deg RMS during a 3-second hold at 60 cm.
- World drift MUST stay <0.5 m over a 30-second walk at 1.2 m/s.
- AR sessions MUST run 15 minutes without thermal shutdown while logging any thermal warnings.
- App cold start to first AR frame MUST complete within 3.0 seconds on reference devices.
- Battery drain MUST stay <=9% per 15-minute session at 75% brightness.

*Rationale:* These SLOs keep the HUD responsive and trustworthy in play.

### Accuracy & Anchoring
- Distance overlays MUST stay within 2.0 m absolute error for 30-200 m ranges given known GPS accuracy.
- 95% of anchors MUST remain within 0.5 m after 30 seconds of slow panning.
- Wind hints MUST remain qualitative (calm, breeze, windy) with no implied numeric guarantee in v1.

*Rationale:* Stable overlays and honest messaging protect player confidence.

### Reliability & Fallbacks
- Trailing 1,000 AR-HUD sessions MUST record >=99.5% crash-free rate.
- When AR tracking quality is poor for >2 seconds, the experience MUST downgrade to a 2D compass view and automatically recover when tracking improves.
- Offline continuity MUST preserve the current hole's data and show an offline badge while resuming seamlessly once connectivity returns.

*Rationale:* Predictable degradation keeps play moving even when conditions change.

### UX & Accessibility
- HUD text MUST meet WCAG AA contrast targets at 75% screen brightness.
- Interactive targets MUST remain reachable one-handed on 6.7 inch screens.
- UI layouts MUST accommodate font scaling up to 130% without breakage.
- The center 8% of the field of view MUST remain clear and a periodic "Heads up" banner MUST remind players to stay situationally aware.

*Rationale:* Inclusive ergonomics make the HUD usable and safe on course.

### Security & Privacy
- Frames and location data MUST remain on-device unless users grant explicit consent to share.
- Telemetry MUST be anonymized and exclude raw frames or PII; logs MUST redact sensitive values.
- Camera and coarse location permissions MUST only be requested when the capability is about to be used.

*Rationale:* Respecting privacy preserves trust and satisfies policy requirements.

### Observability & Telemetry
- Each session MUST emit metrics covering session_count, session_duration, fps_avg, fps_p10, latency_ms_p50/p90, tracking_quality_p50, anchor_resets, thermal_warnings, and fallback_events.
- Logs MUST be structured JSON that include build_id and device_class for every entry.
- Detailed performance traces MUST sample no more than 10% of sessions.

*Rationale:* Focused telemetry makes it possible to validate SLOs without overwhelming users' devices.

### Quality Gates
- Core modules MUST maintain >=85% line coverage.
- Linting MUST finish with zero errors and <=5 warnings per build.
- Bundle size increases MUST remain <=20 MB per platform relative to the previous release.
- Builds MUST be deterministic with pinned toolchains and dependency locks.
- Third-party licenses MUST exclude GPL-only packages, and a license manifest MUST ship with each release.

*Rationale:* Strong gates keep regressions and compliance issues out of production.

### Testing Strategy
- Unit tests MUST validate transforms, projections, and distance math.
- Simulation suites MUST exercise synthetic camera paths, jitter, drift, and latency scenarios.
- Device testing MUST cover at least two Android and two iOS reference devices.
- Field testing MUST cover tee box, fairway walk, and approach scenarios with all SLOs passing.
- Golden screenshots MUST exist for primary HUD states at three font scales.

*Rationale:* Layered testing proves resilience before players rely on the HUD.

### Interoperability
- AR-HUD MUST call CaddieCore v1 read-only endpoints with a 200 ms timeout and degrade gracefully when responses delay or fail.
- Feature flags (`hud_wind_hint`, `hud_target_line`, `hud_battery_saver`) MUST gate optional capabilities with documented defaults.

*Rationale:* Controlled integrations prevent cascading failures across services.

### Developer Experience
- `make run-ios` and `make run-android` MUST launch the demo hole scenario end-to-end.
- Example hole data MUST ship in the repository for offline development.
- A three-finger tap MUST toggle the performance overlay for debugging sessions.

*Rationale:* Efficient tooling keeps iteration velocity high without breaking standards.

### Release Criteria
- Releases MUST demonstrate that every performance SLO and accuracy target passes on reference devices.
- No P0 or P1 defects may remain open at release sign-off.
- Product manager and QA leads MUST sign the field checklist for each release candidate.
- Privacy review MUST be complete and telemetry sampling controls MUST be verified.

*Rationale:* Clear exit gates ensure only production-ready builds ship.

### Scope Boundaries
- Live ball flight tracking, multi-user or caddie sharing, voice and smartwatch control, 3D green maps, rain/night optimization, and similar items MUST remain outside v1 scope and be tracked as future work.

*Rationale:* Documented boundaries stop scope creep from eroding quality.

### Terminology & Clarity
- "HUD" refers to the overlay rendered within the camera view.
- "Anchor" refers to a persisted world-space point that anchors virtual elements.
- "Drift" refers to the mismatch between virtual and real positions over time.

*Rationale:* Shared language keeps specs, code, and QA anchored to the same definitions.

## Operational Reliability & Compliance
- Telemetry dashboards MUST visualize the required metrics and highlight thermal warnings, fallback events, and anchor resets for each release.
- Compliance reviews MUST confirm privacy posture (no raw frames/PII) and license manifests before production rollout.
- Offline continuity, downgrade behaviors, and thermal logging MUST be exercised in staging prior to release pushes.

*Rationale:* Ongoing verification keeps operations aligned with commitments.

## Delivery Workflow & Decision Gates
- Features MUST still progress through `/specify -> /plan -> /tasks` before implementation begins, with each artifact mapping constitution principles to concrete tasks and acceptance evidence.
- Plans MUST enumerate instrumentation, SLO tests, device matrix coverage, golden screenshots, field checklist ownership, and privacy review steps before development starts.
- Implementation MUST block merges until unit, simulation, device, and field tests pass; deviations or waivers MUST be logged with owner approvals in `/plan`.
- Release readiness MUST record PM and QA sign-off, privacy review status, and telemetry sampling compliance before tagging.

*Rationale:* Structured gates maintain traceability from intent to release.

## Governance
- Amendments require joint approval from the AR tech lead and product lead, recorded in the commit updating `.specify/memory/constitution.md` with rationale.
- Constitution versioning follows SemVer (MAJOR for backwards-incompatible governance or scope changes, MINOR for new principles/sections, PATCH for clarifications).
- The constitution undergoes quarterly review alongside SLO telemetry, privacy posture, and dependency/license audits.
- Violations post-merge MUST trigger an action plan documented in `/plan` plus follow-up telemetry review within the next release cycle.
- Runtime guides (README, docs, agent templates, command templates) MUST be kept in sync with this constitution.

**Version**: 0.2.0  **Ratified**: TODO(RATIFICATION_DATE): set on first merge to main  **Last Amended**: 2025-09-24

