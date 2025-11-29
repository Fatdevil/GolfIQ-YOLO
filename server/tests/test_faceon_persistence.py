import numpy as np

from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline import analyze as analyze_module


def test_analyze_frames_persists_faceon_metrics(monkeypatch):
    captured = {}

    def _fake_compute(detections, *, frame_w, frame_h, mm_per_px=None):
        captured["detections"] = detections
        captured["frame_w"] = frame_w
        captured["frame_h"] = frame_h
        captured["mm_per_px"] = mm_per_px
        return {
            "sway_px": 5.0,
            "sway_cm": 1.0,
            "shoulder_tilt_deg": 2.0,
            "shaft_lean_deg": -1.0,
        }

    monkeypatch.setattr(analyze_module, "compute_faceon_metrics", _fake_compute)

    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(3)]
    calib = CalibrationParams.from_reference(1.0, 100.0, 30.0)

    result = analyze_module.analyze_frames(
        frames, calib, mock=True, smoothing_window=1
    )

    assert result["metrics"].get("faceon") == {
        "sway_px": 5.0,
        "sway_cm": 1.0,
        "shoulder_tilt_deg": 2.0,
        "shaft_lean_deg": -1.0,
    }
    assert captured["frame_w"] == 64
    assert captured["frame_h"] == 64
    assert captured["mm_per_px"] == 10.0
    assert captured["detections"], "detections payload should be forwarded"
