# Feature Specification: AR-HUD v1 specify

**Feature Branch**: `002-title-ar-hud`  
**Created**: 2025-09-24  
**Status**: Draft  
**Input**: User description: "AR-HUD v1 Specify"

## Execution Flow (main)
```
1. Parse golfer-facing AR-HUD brief and confirm supported vs. out-of-scope capabilities.
2. Extract audience assumptions, user stories, SLOs, and Definition of Done checkpoints.
3. Flag missing data (device classes, environment limits, telemetry gaps) with [NEEDS CLARIFICATION: ...].
4. Populate User Scenarios & Testing with primary flow, acceptance, and edge cases.
5. Derive Functional Requirements tied to overlays, stability, wind hints, and fallbacks.
6. Identify Key Entities (sessions, anchors, telemetry, device profiles, feature flags).
7. Fill Non-Functional Targets with constitution SLOs, coverage gates, telemetry metrics, privacy and compliance expectations.
8. Run Review Checklist to ensure no [NEEDS CLARIFICATION] items remain.
```

## Quick Guidelines
- Focus on the golfer experience outdoors in daylight and why it matters.
- Avoid implementation specifics (toolkits, rendering engines, API classes).
- Write for product, design, and QA stakeholders evaluating release readiness.

## Clarifications

### Audience
- Everyday golfers using a single phone outdoors in daylight.

### Scope v1
- Supported: phone camera AR, ground plane detection, stable reticle, distance-to-pin and layup markers, target line, qualitative wind hint, CaddieCore v1 club suggestion, sunlight-readable HUD theme, tap/long-press/swipe gestures, offline continuity within the current hole.
- Out of scope: multi-user sync, AR glasses, night mode, lidar elevation, live ball-flight tracking, 3D green contours, voice control, social overlays, live scoring, rain/night optimisation.

### Performance & Reliability Inputs
- Maintain >=30 fps camera preview (target 45) with HUD update latency <=120 ms.
- Pose stability <1.0 deg RMS over a 3 s hold; drift <0.5 m over a 30 s walk at 1.2 m/s.
- Sustain 15 min AR session without thermal shutdown; log thermal warnings.
- Cold start to first AR frame <=3.0 s; battery impact <=9% per 15 min session at 75% brightness.
- Crash-free sessions >=99.5% across the trailing 1,000 runs.

### Observability & Compliance Inputs
- Metrics: session_count, session_duration, fps_avg, fps_p10, latency_ms_p50/p90, tracking_quality_p50, anchor_resets, thermal_warnings, fallback_events.
- Logs: structured JSON including build_id and device_class; detailed performance traces sampled in <=10% sessions with opt-out controls.
- Privacy: no raw frames or location leave the device without consent; telemetry anonymised; request camera and coarse location only when needed.
- Quality gates: >=85% line coverage, lint zero errors (<=5 warnings), bundle growth <=20 MB per platform, deterministic builds, no GPL-only dependencies, licence manifest recorded.

### Definition of Done
- Meets all constitution SLOs and accuracy targets.
- Contracts with CaddieCore v1 are implemented with 200 ms timeout handling.
- Field tests (tee, fairway, approach) pass with logs and screenshots archived.
- App store build settings validated (no debug flags, correct permission text).

### Session 2025-09-24
- Reference devices: iPhone 14, iPhone 15, Pixel 7, Pixel 8.
- Outdoor conditions: daylight use only at ~75% brightness with no rain.
- CaddieCore timeout: 200 ms read-only requests must degrade gracefully on timeout.
- Feature flags default state: hud_wind_hint=on, hud_target_line=on, hud_battery_saver=on.
- Offline continuity: cache the current hole, show an "Offline" badge, and resynchronise silently once connectivity returns.
- Safety reminders: keep the centre 8% FOV clear and surface a "Heads up" banner every 20 minutes.
- Telemetry ownership: AR team maintains the Grafana "AR-HUD v1" dashboard.
- Q: How often should GroundFitter re-validate anchors during steady tracking? -> A: Re-validate when pose delta exceeds the movement threshold.

## User Scenarios & Testing *(mandatory)*

### Primary User Story
A golfer on the fairway launches the AR-HUD on a 2023+ phone, locks onto the ground plane, and views distance overlays, target line, wind hint, and CaddieCore club suggestion to choose a club quickly.

### Acceptance Scenarios
1. **Given** a calibrated ground plane and CaddieCore data, **When** the golfer aims at the pin, **Then** the HUD shows distance-to-pin, layup markers, target line, qualitative wind hint, and club recommendation within latency and accuracy budgets.
2. **Given** the golfer pans or walks with the HUD active, **When** they realign to the target, **Then** overlays remain stable (drift <0.5 m, pose jitter <1.0 deg RMS) while the session maintains >=30 fps.
3. **Given** AR tracking quality drops for more than 2 seconds, **When** the golfer continues using the app, **Then** the HUD downgrades to a 2D compass view, surfaces the fallback banner, and restores full AR automatically when tracking improves.
4. **Given** connectivity is lost mid-hole, **When** the golfer requests club guidance, **Then** cached distances and CaddieCore suggestions remain available and an offline badge is displayed until sync resumes.

### Edge Cases
- GPS or hazard data missing: show conservative overlays, flag missing context, and continue HUD session.
- Thermal warning triggered: record telemetry, show a battery/thermal hint, and keep HUD active unless shutdown is imminent.
- Wind hint feature flag disabled: hide wind indicator while keeping other overlays intact.
- User exceeds battery budget (>=9% drain in 15 minutes): prompt with battery saver recommendation without disabling HUD.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The HUD MUST render distance-to-pin and layup markers anchored to the detected ground plane for daylight outdoor use.
- **FR-002**: The system MUST request CaddieCore v1 club suggestions via read-only calls (200 ms timeout), display the selected club and conservative alternative if provided, and gracefully fall back to the last cached suggestion when timeouts occur.
- **FR-003**: The HUD MUST overlay a target line aligned with the golfer's aim and allow tap/long-press adjustments.
- **FR-004**: The experience MUST present a qualitative wind hint (calm, breeze, windy) when the `hud_wind_hint` flag is enabled and suppress it when disabled.
- **FR-005**: The HUD MUST remain stable while the golfer walks or pans, maintaining drift <0.5 m and pose jitter <1.0 deg RMS, update overlays within 120 ms, and re-validate anchors whenever the pose delta exceeds the configured movement threshold.
- **FR-006**: When tracking quality degrades for >2 seconds, the HUD MUST downgrade to a 2D compass view, show a fallback banner, and auto-recover when tracking stabilises.
- **FR-007**: The session MUST persist the current hole data, display an offline badge on connectivity loss, and resynchronise silently on reconnection.
- **FR-008**: A three-finger tap MUST toggle a performance overlay showing fps, latency, and thermal indicators for field verification.
- **FR-009**: The HUD theme MUST meet WCAG AA contrast at 75% brightness and keep the central 8% of the field of view unobstructed.
- **FR-010**: Telemetry MUST capture required metrics, structured logs, and sampled traces without exporting raw frames or precise location unless consented.
- **FR-011**: Release packaging MUST confirm bundle growth <=20 MB per platform, deterministic builds, and accurate store permission text before submission.

### Key Entities *(include if feature involves data)*
- **HUDSession**: Session lifecycle record (device class, start/end times, thermal events, battery impact, fallback states).
- **Anchor**: World-space reference storing stability confidence, drift, and association to overlay elements.
- **OverlayElement**: Distance markers, target line segments, wind hints, and safety banners tied to anchors and feature flags.
- **TelemetrySample**: Structured metric/log payload containing build_id, device_class, metric values, sampling markers, and consent state.
- **DeviceProfile**: Reference device definitions (OS version, chipset, thermal thresholds) required for SLO validation, including iPhone 14, iPhone 15, Pixel 7, and Pixel 8 baselines.
- **FeatureFlagConfig**: Status of `hud_wind_hint`, `hud_target_line`, and `hud_battery_saver` toggles for each session with defaults (on, on, on).

## Non-Functional Targets *(mandatory for major features)*
- **Performance & Latency**: Maintain >=30 fps camera preview (target 45), <=120 ms HUD update latency, <1.0 deg pose jitter over 3 seconds, <0.5 m drift over 30 seconds at 1.2 m/s, sustain 15-minute sessions without thermal shutdown while logging warnings, cold start <=3.0 s, and battery impact <=9% per 15-minute session at 75% brightness.
- **Accuracy & Anchoring**: Keep distance overlays within 2.0 m absolute error across 30-200 m ranges, ensure 95% anchors stay within 0.5 m after 30 seconds, and limit wind hints to qualitative tiers without implying exact speeds.
- **Reliability & Fallbacks**: Achieve >=99.5% crash-free rate over trailing 1,000 sessions, execute downgrade-to-compass flows when tracking is poor >2 s, and preserve offline continuity with visible status badges.
- **UX & Accessibility**: Deliver WCAG AA contrast at 75% brightness for daylight outdoor use, one-handed reach targets on 6.7 in screens, font scaling to 130% without layout failures, keep the central 8% FOV clear, and show periodic "Heads up" safety banners every 20 minutes.
- **Security & Privacy**: Keep frames and location data on-device unless consented, anonymise telemetry without raw frames/PII, and request camera and coarse location permissions only when needed.
- **Observability & Telemetry**: Emit required metrics, structured JSON logs (build_id, device_class), and sample detailed performance traces in <=10% sessions with opt-out controls; document dashboards and alert owners (AR team) in the Grafana "AR-HUD v1" board.
- **Quality Gates**: Maintain >=85% line coverage in core modules, finish lint with zero errors (<=5 warnings), cap bundle growth at <=20 MB per platform, enforce deterministic builds via pinned toolchains, and update the licence manifest (no GPL-only dependencies).
- **Testing Strategy**: Cover unit tests for transforms/projection/distance math, simulation suites for camera paths/jitter/drift/latency, device runs on 2 Android + 2 iOS reference devices, field validation (tee, fairway, approach) with logs/screenshots, and golden screenshots across three font scales.

## Review & Acceptance Checklist
- [ ] No implementation details (languages, frameworks, APIs).
- [ ] Focused on user value and business needs.
- [ ] Written for non-technical stakeholders.
- [ ] All mandatory sections completed.
- [ ] No [NEEDS CLARIFICATION] markers remain.
- [ ] Requirements are testable and unambiguous.
- [ ] Success criteria are measurable.
- [ ] Scope is clearly bounded.
- [ ] Dependencies and assumptions identified.

## Execution Status
- [ ] User description parsed.
- [ ] Key concepts extracted.
- [ ] Ambiguities marked.
- [ ] User scenarios defined.
- [ ] Requirements generated.
- [ ] Entities identified.
- [ ] Review checklist passed.
