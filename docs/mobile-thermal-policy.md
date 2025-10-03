# Mobile Thermal & Battery Fallback Policy

This document describes the shared iOS and Android policy that governs when the HUD automatically reduces load or falls back to the lightweight 2D compass experience.

## Watchdogs

- **Thermal**
  - iOS listens to `ProcessInfo.processInfo.thermalState` and maps to `nominal`, `fair`, `serious`, `critical`.
  - Android listens to `PowerManager.currentThermalStatus` and maps to `NONE`, `LIGHT`, `MODERATE`, `SEVERE`, `CRITICAL`.
- **Battery**
  - Both platforms maintain a rolling 15-minute window of battery samples (percent 0–100) and estimate the drop over that period.

## Thresholds (defaults)

| Signal            | Threshold                         | Action            |
| ----------------- | --------------------------------- | ----------------- |
| Thermal severity  | ≥ `serious` (iOS) / `SEVERE` (Android) | Switch to 2D compass |
| Battery drop      | > `9%` over the last 15 minutes    | Reduce HUD detail |

The policy returns one of three actions:

- `none`: no change.
- `reduce_hud`: callers may dim or simplify AR overlays to conserve resources.
- `switch_to_2d`: triggers the compass-only fallback via `HUDRuntime`.

## Telemetry Event Shape

Both platforms emit a `thermal_battery` event every 60 seconds while the HUD is active:

```json
{
  "event": "thermal_battery",
  "payload": {
    "thermal": "serious",
    "battery_pct": 78.0,
    "drop_15m_pct": 10.2,
    "action": "switch_to_2d"
  }
}
```

Use these metrics to tune thresholds or investigate regressions. Adjusting the constants in `FallbackPolicy` allows quick experimentation.
