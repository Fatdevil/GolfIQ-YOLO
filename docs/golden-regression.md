# Golden Regression Checks

The golden regression suite validates that our deterministic back-view mock
clip continues to produce stable launch metrics when processed through the CV
pipeline. The expectations are intentionally tolerant enough to permit minor
refinements while still catching meaningful regressions.

## Test clip configuration

- **Frames:** 12 synthetic 720p RGB frames (all zeros) processed with the mock
  YOLOv8 detector.
- **Calibration:** `m_per_px=0.005`, `fps=120.0`.
- **Pipeline:** `cv_engine.pipeline.analyze.analyze_frames` with
  `mock=True` to force deterministic detections and trackers.

## Acceptance thresholds

For the aggregate metrics reported by `analyze_frames`:

- **Ball speed:** Must remain within ±3% of the golden value (`1.594 m/s`).
- **Side angle:** Must remain within ±1.5° of the golden value (`90°`).
- **Carry estimate:** Must remain within ±12 meters of the golden value
  (`0.25 m`).

The thresholds match the tolerances enforced in
`tests/golden/test_backview_golden.py` and are designed to protect downstream
launch monitor expectations without blocking incremental improvements.
