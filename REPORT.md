# Release Notes

## CV Engine v1.1 changes
- Added pluggable tracking backends (identity default, ByteTrack, Norfair) with unit coverage for ID stability and reset behaviour.
- Hardened kinematics helpers with sliding-window velocity sampling and outlier clamping for sparse/missing detections.
- Introduced pose adapter metrics (shoulder/hip tilt, tempo) as internal-only observability signals with OTel spans + Prometheus stage telemetry.

## AR-HUD MVP scaffolding & Offline Bundle
- Added a shared AR-HUD library with state machine, smoothing utilities, and coverage for wrap-around edge cases.
- Introduced a flag/RC-aware offline bundle endpoint with cache headers plus tests for TTL + ETag stability.
- Split mobile CI into parallel Android/iOS workflows so AR-HUD changes trigger platform validation without blocking server/JS pipelines.
