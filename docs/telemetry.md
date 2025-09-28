# Telemetry — AR-HUD v1

## Metrics per session
- session_count, session_duration_s
- fps_avg, fps_p10
- hud_latency_ms_p50, hud_latency_ms_p90
- tracking_quality_p50
- anchor_resets_count
- thermal_warnings_count
- fallback_events_count

## Logs
- JSON, includes build_id and device_class, no PII/raw frames

## Traces
- <= 10% sessions sampled, remotely configurable

## Dashboards
- "AR-HUD v1" (owners: AR team)
- TODO: add links when dashboards are created
