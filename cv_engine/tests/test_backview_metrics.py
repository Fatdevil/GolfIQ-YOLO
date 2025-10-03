from __future__ import annotations

import numpy as np

from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames


def test_mock_clip_backview_metrics():
    frames = [np.zeros((720, 1280, 3), dtype=np.uint8) for _ in range(20)]
    calib = CalibrationParams.from_reference(1.0, 100.0, 120.0)
    result = analyze_frames(frames, calib, mock=True, smoothing_window=1)
    metrics = result["metrics"]

    expected_speed = 3.109
    expected_angle = 90.0

    assert abs(metrics["ballSpeedMps"] - expected_speed) / expected_speed < 0.03
    assert abs(metrics["sideAngleDeg"] - expected_angle) <= 1.5
    assert "quality" in metrics
    assert set(metrics["quality"].keys()) == {"fps", "homography", "lighting"}
    assert metrics["carryEstM"] >= 0.0
