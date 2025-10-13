# AR-HUD MVP Control Surfaces

## State Machine

The shared `arhud` module exposes a deterministic finite state machine that tracks HUD readiness:

- `AIM` → `CALIBRATE` → `TRACK` is the primary progression.
- `TRACK` can request `RECENTER` and returns to `TRACK` once complete.
- `trackingLost` resets the HUD to `AIM` from any active state.

The machine guards against illegal transitions and can be reset to its initial state for reuse.

## Heading Smoothing

Heading updates use an exponential moving average with wrap-around handling so headings near `0°/360°` stay continuous. The smoother tracks a running RMS error budget to ensure steady inputs remain within `≤ 1°` noise.

- Default smoothing factor (`alpha`) is `0.2`.
- RMS is computed over a small sliding window and exposed for monitoring.
- Resets clear history for fast recalibration.

## Service-Level Objectives

- **Update cadence:** ≥ 30 FPS minimum (`FPS_MIN`).
- **Latency envelope:** ≤ 120 ms HUD rendering latency (`HUD_LATENCY_MAX_MS`).
- **Recentering:** Complete within 2 seconds (`RECENTER_MAX_S`).
- **Heading stability:** RMS error ≤ 1° during steady motion (`HEADING_RMS_MAX_DEG`).
