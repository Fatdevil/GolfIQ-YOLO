# GolfIQ Swing & Range Metrics Inventory

This single source of truth enumerates the swing metrics currently computed and persisted by the CV pipeline. It complements the machine-readable catalog in [`swing_range_metrics.json`](./swing_range_metrics.json) and the new tour reference bands in [`tour_swing_reference.json`](./tour_swing_reference.json).

## Sequence metrics (down-the-line)
- `max_shoulder_rotation` (deg)
- `max_hip_rotation` (deg)
- `max_x_factor` (deg)
- `sequence_order` (list of segments)
- `is_ideal` flag to highlight tour-like ordering

## Ball/club metrics
- `launch_deg` (deg)
- `sideAngleDeg` (deg)
- `carry_m` (m)
- `ball_speed_mps` / `club_speed_mps` (m/s) and derived MPH fields

## Face-on metrics
Face-on heuristics now persist into the run record under `metrics.faceon` when detections are available:
- `sway_px` and `sway_cm`
- `shoulder_tilt_deg`
- `shaft_lean_deg`

## Tour reference bands (v1)
Reference bands for key swing metrics live in [`tour_swing_reference.json`](./tour_swing_reference.json). The current v1 includes shoulder rotation, hip rotation, X-factor, and launch windows for common clubs. These are heuristic guide rails intended for “you vs tour” comparisons.

## SwingMetrics API
Backend consumers can fetch a consolidated view at `GET /api/swing/{run_id}/metrics`. The endpoint returns available swing metrics (sequence, face-on, and ball/club) alongside comparisons against the tour reference bands.

## Web UI: Swing Diagnostics Panel v1
- The web Run Detail page now surfaces swing metrics via **Swing Diagnostics & tour comparison**.
- It consumes `GET /api/swing/{run_id}/metrics` and highlights shoulder/hip rotation, X-factor, launch, side angle, and face-on sway when available.
- Each metric shows a “below / within / above tour range” cue using the bands in `tour_swing_reference.json`, plus simple coaching copy to keep it friendly for golfers and coaches.
