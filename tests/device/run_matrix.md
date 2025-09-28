# Device Run Matrix — AR-HUD v1

## Reference Devices
- iOS: iPhone 14, iPhone 15
- Android: Pixel 7, Pixel 8

## Procedure (each device)
1) Launch AR-HUD demo (daylight, 75% brightness).
2) Do three runs (tee, fairway walk 30s  1.2 m/s, approach).
3) Capture telemetry + screenshots.

## Evidence to capture
- Logs: fps_avg, fps_p10, hud_latency_ms_p50, hud_latency_ms_p90, tracking_quality_p50, anchor_resets_count, thermal_warnings_count, fallback_events_count
- Drift proof on fairway: < 0.5 m over 30 s
- Battery/thermal notes (15 min session if feasible)

## Save evidence to
- artifacts/device/ios/<device>/<date>-teefairwayapproach
- artifacts/device/android/<device>/<date>-teefairwayapproach

---
