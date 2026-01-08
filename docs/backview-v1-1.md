# Back-view v1.1 Server Notes

## Environment toggles
- `GOLFIQ_TRACKER`: `bytetrack` (default), `norfair`, or `identity` for deterministic ids.
- `GOLFIQ_BALL_TRACKER`: `norfair` (default), `bytetrack`, or `identity` for stabilized ball tracking.
- `POSE_BACKEND`: `mediapipe` (default), `movenet`, or `none` to disable pose sampling.

## Ball tracking stabilization
The ball tracking layer applies gating + EMA smoothing to reduce track breaks on dropouts.
Tune the following environment variables when needed:

- `TRACK_MAX_GAP_FRAMES` (default: `4`): maximum number of missing frames before the track is reset.
- `TRACK_GATING_DISTANCE_PX` (default: `90`): distance threshold (pixels) used to recover a track after a gap.
- `TRACK_OUTLIER_DISTANCE_PX` (default: `140`): maximum allowed jump before a detection is treated as an outlier.
- `TRACK_SMOOTHING_ALPHA` (default: `0.45`): EMA smoothing factor for ball positions.

## API response extensions
The `/cv/analyze` and `/cv/analyze/video` endpoints now return the existing metrics plus additional fields:

- `ballSpeedMps`, `clubSpeedMps`: raw (unrounded) m/s readings alongside legacy snake_case values.
- `sideAngleDeg`: lateral angle derived from ground-plane projection.
- `vertLaunchDeg`: optional single-camera launch estimate (may be `null`).
- `carryEstM`: drag-adjusted carry estimate.
- `quality`: heuristic quality flags `{fps, homography, lighting}` (`good|warn|low`).

These additions are backward compatible – existing consumers can continue using snake_case fields.

### Example payload
```json
{
  "events": [42],
  "metrics": {
    "ball_speed_mps": 36.4,
    "ball_speed_mph": 81.4,
    "club_speed_mps": 43.1,
    "club_speed_mph": 96.4,
    "launch_deg": 14.5,
    "carry_m": 187.2,
    "metrics_version": 1,
    "spin_rpm": null,
    "spin_axis_deg": null,
    "club_path_deg": null,
    "confidence": 0.87,
    "ballSpeedMps": 36.421,
    "clubSpeedMps": 43.065,
    "sideAngleDeg": -1.2,
    "vertLaunchDeg": 13.9,
    "carryEstM": 183.4,
    "quality": {
      "fps": "good",
      "homography": "warn",
      "lighting": "good"
    }
  }
}
```

## Homography workflow (optional)
1. Collect 2–4 reference correspondences between image pixels and ground-plane meters.
2. Feed them to `cv_engine.calibration.homography.estimate_homography` to obtain an `H` matrix.
3. Use `to_ground_plane` to map tracked ball points into ground coordinates.
4. Provide the matrix to downstream analytics when a calibrated setup is available; otherwise the pipeline falls back to a scale-only approximation and marks `quality.homography="warn"`.

For more precise launch and side-angle metrics, prefer at least three well-separated references (corners of a hitting mat, alignment sticks, etc.).
