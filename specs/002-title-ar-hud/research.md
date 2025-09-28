# Phase 0 Research — AR-HUD v1 on-course HUD

## Device & Platform Baseline
- **Decision:** Support iOS 17+ (iPhone 14/15) and Android 14+ (Pixel 7/8) for AR-HUD v1.
- **Rationale:** Matches constitution device matrix and ensures ARKit 6 / ARCore 1.40 availability with required performance budgets.
- **Alternatives Considered:** Broaden to older hardware (iPhone 12, Pixel 5) — rejected due to thermal and latency risks.

## Pose & Anchor Handling
- **Decision:** Implement `PoseAdapter` abstraction with shared math utilities and re-validate anchors when pose delta exceeds configured movement thresholds.
- **Rationale:** Keeps ARKit and ARCore pose data harmonised while satisfying drift (<0.5 m) and jitter (<1.0 deg RMS) targets.
- **Alternatives Considered:** Fixed-interval revalidation (every N frames) — rejected because sudden golfer movement could exceed drift limits before the interval.

## Distance & Error Clamping
- **Decision:** `DistanceResolver` clamps distance overlays to a ±2.0 m window using fused GPS + anchor distance, highlighting degraded accuracy when clamps trigger repeatedly.
- **Rationale:** Guarantees constitution accuracy target while signalling edge cases for logs and UI prompts.
- **Alternatives Considered:** Display raw sensor distance — rejected as it can breach 2.0 m error budget under weak GPS.

## CaddieCore Integration & Offline Strategy
- **Decision:** Use read-only HTTP client with 200 ms timeout and fallback to last cached recommendation when timeouts occur; cache current hole (`CachedHole`) with pin/layup targets.
- **Rationale:** Satisfies interoperability clause, offline continuity, and graceful degradation requirements.
- **Alternatives Considered:** Retry until success — rejected because it risks exceeding latency budgets and drains battery.

## Feature Flags & Telemetry Transport
- **Decision:** Bootstrap feature flags (`hud_wind_hint`, `hud_target_line`, `hud_battery_saver`) via optional FeatureFlags endpoint; default to "on" in local config. Telemetry batches anonymised metrics/logs to collector with <=10% sampling and Grafana AR-HUD v1 dashboard ownership.
- **Rationale:** Maintains constitution observability expectations and ensures runtime parity between device and dashboards.
- **Alternatives Considered:** Hardcode flags in apps — rejected; reduces operational control.

## Build & Tooling Determinism
- **Decision:** `make run-ios` / `make run-android` invoke pinned Xcode/Gradle/NDK toolchains, install sample hole data, and toggle PerfOverlay for instrumentation.
- **Rationale:** Aligns with developer experience requirements and keeps builds reproducible.
- **Alternatives Considered:** Manual platform-specific scripts — rejected due to duplication and higher drift risk.
