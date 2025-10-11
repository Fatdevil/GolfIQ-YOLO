# Release Notes

## CV Engine v1.1 changes
- Added pluggable tracking backends (identity default, ByteTrack, Norfair) with unit coverage for ID stability and reset behaviour.
- Hardened kinematics helpers with sliding-window velocity sampling and outlier clamping for sparse/missing detections.
- Introduced pose adapter metrics (shoulder/hip tilt, tempo) as internal-only observability signals with OTel spans + Prometheus stage telemetry.
