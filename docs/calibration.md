# Calibration v1

Calibration v1 adds a lightweight, deterministic path for converting a stabilized ball
track from pixels to meters and fitting a simple 2D trajectory. It is intentionally
minimal and CI-safe: no heavy inference or external dependencies beyond numpy.

## What it does
- Converts pixel tracks to meters using a provided scale (`scalePxPerMeter` or
  `metersPerPixel`).
- Detects a contiguous launch window (early-flight frames, ignoring long gaps).
- Fits a simple ballistic curve to estimate:
  - initial velocity components (vx, vy)
  - launch angle
  - speed (m/s and mph)
  - a basic carry proxy (2D range)
- Emits diagnostics and reason codes when calibration is skipped or uncertain.

## What it does not do
- Full 3D reconstruction.
- Spin/curve modeling.
- Any UI rendering or mobile-side changes.

## Required inputs
Calibration v1 requires:
- `scalePxPerMeter` (preferred) or `metersPerPixel`
- `cameraFps` (or pipeline `fps` as fallback)

Optional fallback:
- `referenceDistanceM` + `referencePointsPx` (two pixel points with known distance)

## TrackPoint.frame_idx semantics
`TrackPoint.frame_idx` is the frame index used for timing and gap detection inside
calibration. It is intentionally lightweight and derived from the track sequence:

- When `TrackPoint` values are constructed from a stabilized track, `frame_idx`
  comes from enumerating the stabilized track's full frame list (including `None`
  placeholders for missing detections). This preserves the original per-frame
  index so gaps appear as jumps in `frame_idx`.
- When `TrackPoint` values are created from a plain list of `(x_px, y_px)` points,
  `frame_idx` is simply the sequential index in that list (0..N-1).

Because calibration only needs relative timing and gap sizes, this is consistent
and safe for downstream calculations: `frame_idx` is always monotonic within the
track source, and gaps map to larger deltas even when the raw video frame count
differs from the number of detections.

## Ordering & sorting assumptions
Calibration functions assume the track is in temporal order but still sort by
`frame_idx` before window selection and trajectory fitting. The launch-window
detector also sorts internally, so passing unsorted points is safe. Downstream
metrics (including `ballTrackM`) use the sorted order, while the launch-window
logic consumes the current ordered track when evaluating gaps.

## Enabling calibration
Calibration is wired through the analyze pipeline. The API payload accepts:
- `scalePxPerMeter` (pixels per meter)
- `metersPerPixel`
- `referenceDistanceM`
- `referencePointsPx`
- `cameraFps`

The server parses these in `server/routes/cv_analyze.py` and builds a
`CalibrationConfig`, which is passed into the pipeline and used by
`cv_engine.calibration.v1.calibrated_metrics`.

## Diagnostics and reason codes
The calibration payload includes `quality.reasonCodes` plus fit diagnostics:

Common reason codes:
- `calibration_missing` / `missing_scale` — scale not provided.
- `launch_window_too_short` — not enough contiguous frames for fitting.
- `fit_low_confidence` — low R² on the trajectory fit.
- `calibration_unstable` — calibration was run but confidence is low.
- `missing_fps` — FPS is unavailable or invalid.

The `metrics.explain` section surfaces these reasons with explain rules such as:
- `calibration_missing`
- `calibration_unstable`
- `launch_window_too_short`
- `fit_low_confidence`

## Outputs (additive)
When calibration succeeds, the pipeline adds a `calibrated` payload containing:
- `metersPerPixel`, `scalePxPerMeter`
- `launchWindow` (start/end frame, length, confidence)
- `speedMps`, `speedMph`, `launchAngleDeg`, `carryM`, `peakHeightM`
- `fit` diagnostics (`r2`, `rmse`, `vxMps`, `vyMps`)
- `ballTrackM` (pixel track converted to meters)

When calibration is skipped, the payload still includes diagnostics and may include
pixel-domain kinematics under `pixelKinematics`.
