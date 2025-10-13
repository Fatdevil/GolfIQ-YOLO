# Release Notes

## CV Engine v1.1 changes
- Added pluggable tracking backends (identity default, ByteTrack, Norfair) with unit coverage for ID stability and reset behaviour.
- Hardened kinematics helpers with sliding-window velocity sampling and outlier clamping for sparse/missing detections.
- Introduced pose adapter metrics (shoulder/hip tilt, tempo) as internal-only observability signals with OTel spans + Prometheus stage telemetry.

## AR-HUD MVP scaffolding & Offline Bundle
- Added shared AR-HUD state machine, heading smoother, and guardrails with unit coverage.
- Documented AR-HUD SLOs alongside offline bundle contract and cache headers.
- Delivered FastAPI bundle endpoint with weak ETag + TTL config support and CI hardening for mobile/binary safety.

## M4 QA-HUD wired to telemetry
- Added a QA-gated HUD screen that streams the shared AR-HUD state, heading smoother,
  and synthetic camera feed directly inside the Expo QA shell.
- Persisted HUD telemetry to `hud_run.json`, mirrored events to the flight-recorder
  channel, and exposed an export path through the existing `/runs` API.
