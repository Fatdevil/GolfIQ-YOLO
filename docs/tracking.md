# AR-HUD Ground Calibration

This guide covers the two-point ground calibration workflow that powers the AR-HUD ball tracking pipeline.

## When to calibrate

* Run the wizard before your first AR-HUD session and whenever the device position moves more than a few metres.
* Saved calibrations expire after 14 days. The HUD will surface a nudge and mark health as “Poor” once the snapshot is too old.

## Two-point wizard

1. Launch the QA AR-HUD overlay and tap the “Calibrate” button in the HUD status card.
2. **Step 1** – tap a ground point roughly 2–3 m from the phone and enter the straight-line distance (metres).
3. **Step 2** – tap a second point further down-range (aim for at least a 3 m spread) and enter its distance.
4. Review the summary card. If health is acceptable, tap **Done** to persist the homography snapshot. Use **Retake** to capture again.

### Best practices

* Pick points on flat, unobstructed ground along the intended ball flight line.
* Aim for at least 3–4 m between points; longer baselines produce more stable homographies.
* Avoid nearly horizontal alignments—keep the points stacked vertically in frame.
* Re-run the wizard any time you reposition the device or see a “Poor” chip in the HUD.

## Calibration health

Health is derived from the stored homography metadata:

| Health | Rule of thumb |
| ------ | ------------- |
| **Good** | Baseline ≥ 3 m and baseline angle within 15° of vertical. |
| **OK** | Meets minimum geometry but baseline < 3 m or the angle is between 15° and 50° off vertical. |
| **Poor** | Baseline < 0.75 m, the angle is > 50° from vertical, or the snapshot is missing/expired. |

The HUD status chip mirrors this evaluation so operators can identify when recalibration is required.

## Ball tracking stabilizer

The pipeline applies a lightweight ball tracking stabilizer after raw per-frame detections and before calibration/metrics. The stabilizer smooths jitter with an EMA, fills short gaps, and can optionally re-link short segments when motion is plausible. Interpolated points are flagged with `is_interpolated=True` on the `TrackPoint` data. This keeps downstream calibration robust while preserving frame index semantics for timing-aware steps.

When multiple detections exist in the same frame, the stabilizer predicts the next ball position from recent trackpoints and selects the closest detection within a configurable gate. This prevents the track from jumping to distant high-confidence false positives. If no detection falls inside the gate, it falls back to the highest-confidence candidate and records a fallback counter for diagnostics.

### Tuning knobs

The stabilizer is configured through `StabilizerConfig` (and matching environment overrides):

* `max_gap_frames` – maximum number of consecutive missing frames to fill via interpolation.
* `max_px_per_frame` – speed gate for outlier rejection (scaled by frame delta).
* `base_gate` – minimum distance gate for stabilizer outlier rejection.
* `gate_radius_px` – base radius for per-frame detection gating against the predicted position.
* `gate_speed_factor` – multiplier for adaptive gate growth based on recent per-frame speed.
* `ema_alpha` – smoothing factor (higher = less smoothing).
* `min_conf` – minimum confidence to accept large jumps.
* `link_max_distance` – distance gate for segment re-linking (scaled by gap length).
* `dist_weight` / `conf_weight` – scoring weights when choosing between multiple in-gate detections.
* `fallback_max_distance` – maximum distance for fallback selection when no candidates are in gate.

When only one historical point is available (unknown speed), the per-frame selection gate expands using `base_gate + max_px_per_frame * dt` to allow reacquisition after gaps. With a known speed, the gate expands as `base_gate + gate_speed_factor * speed * dt`, and `gate_radius_px` acts as the minimum radius floor.

Frame indices remain monotonic and are used to compute gaps; keep them aligned with the original frame ordering when providing detections.
