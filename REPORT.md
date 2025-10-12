# Release Notes

## CV Engine v1.1 changes
- Added pluggable tracking backends (identity default, ByteTrack, Norfair) with unit coverage for ID stability and reset behaviour.
- Hardened kinematics helpers with sliding-window velocity sampling and outlier clamping for sparse/missing detections.
- Introduced pose adapter metrics (shoulder/hip tilt, tempo) as internal-only observability signals with OTel spans + Prometheus stage telemetry.

## AR-HUD MVP scaffolding & Offline Bundle
- Added shared AR-HUD state machine, heading smoother utilities, and guardrail SLO constants (flag-gated, no UI wiring yet).
- Introduced offline course bundle route + config with deterministic caching headers for future HUD clients.
- Documented HUD scaffolding, offline bundle contract, and split CI coverage for Android/iOS pipelines.
