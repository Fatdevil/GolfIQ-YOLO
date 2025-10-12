# Release Notes

## CV Engine v1.1 changes
- Added pluggable tracking backends (identity default, ByteTrack, Norfair) with unit coverage for ID stability and reset behaviour.
- Hardened kinematics helpers with sliding-window velocity sampling and outlier clamping for sparse/missing detections.
- Introduced pose adapter metrics (shoulder/hip tilt, tempo) as internal-only observability signals with OTel spans + Prometheus stage telemetry.

## AR-HUD MVP scaffolding & Offline Bundle (binary-proof CI)
- Shared AR-HUD scaffolding (state machine, smoothing, SLO docs) to support cross-platform overlays without binary assets.
- Offline bundle FastAPI route with deterministic ETag/TTL headers and tests, plus CI guardrails to keep binary artefacts out of PRs.
