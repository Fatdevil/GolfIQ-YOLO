# Mobile Thermal & Battery Protection Policy

This document describes the lightweight thermal and battery watchdog that guards the GolfIQ AR HUD and live detection experiences.

## Goals

* Detect hazardous device thermal conditions early and drop to a safe 2D compass rendering mode.
* Monitor short-term battery drain while the HUD/live pipeline is active and throttle heavy workloads when drain is excessive.
* Stream telemetry snapshots to `/telemetry` so back-end dashboards can visualise mitigation frequency and tune thresholds remotely.

## Default thresholds

| Metric | Threshold | Action |
| --- | --- | --- |
| Thermal state | `SEVERE` / `serious` or worse | Immediately switch HUD to 2D compass mode, surface the protection banner, and emit telemetry with `policy_action = switch_to_2d`. |
| Battery drain | > 9% drop across any 15 minute window | Reduce HUD refresh cadence (Android: throttle updates; iOS: lower sample rate) and emit telemetry with `policy_action = reduce_refresh`. |
| Battery drain (escalated) | > 13.5% drop (1.5x threshold) over the same window | Pause heavy HUD features (dense inference/audio) and emit telemetry with `policy_action = pause_heavy_features`. |

Telemetry samples are emitted every 60 seconds while monitoring is active. Each sample contains:

* Unix timestamp (`timestamp_ms`),
* Latest thermal status,
* Battery percentage and 15 minute delta,
* Applied policy action and trigger (`thermal`, `battery`, or `user`).

## Platform notes

### Android

* Uses `PowerManager.currentThermalStatus` via `ThermalBatteryPolicy` with a 60 second scheduled sampler.
* Battery data comes from `BatteryManager.BATTERY_PROPERTY_CAPACITY` and is kept in a rolling window for slope estimation.
* Telemetry posts to `/telemetry` immediately using the bench client; failures log but do not crash the HUD.
* UI banner lives in `activity_main.xml` and exposes a "Try resume HUD" action that calls back into the policy.

### iOS

* Observes `ProcessInfo.thermalState` and `UIDevice.batteryLevel` via the `ThermalBatteryPolicy` service.
* Sampling uses a `DispatchSourceTimer` on a serial queue; telemetry samples post immediately to `/telemetry` via `TelemetryClient.sendPolicySamples`.
* A SwiftUI `ThermalProtectionBanner` surfaces inside `ContentView`, mirroring the Android UX with a "Try resume HUD" affordance.

## Tuning guidance

1. **Sampling interval** – increase beyond 60s for slower devices, decrease if you need tighter thermal response. Beware radio/CPU cost when sampling too frequently.
2. **Battery window** – the 15 minute window matches our session length goals. Adjust via the `Config` objects if field data shows false positives.
3. **Policy actions** – attach additional delegates to `ThermalBatteryPolicy` to toggle feature flags (audio, 3D overlays) progressively.
4. **Telemetry** – dashboards should group by `policy_action` to identify noisy mitigations. Consider shipping server-side overrides once enough signal is collected.

To override thresholds per build, supply custom `Config` values when wiring the policies, or feed remote config into those constructors during app bootstrap.
