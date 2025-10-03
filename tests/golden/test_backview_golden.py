from __future__ import annotations

import numpy as np

from cv_engine.pipeline.analyze import analyze_frames
from cv_engine.pipeline.metrics.kinematics import CalibrationParams


def _abs_pct_delta(actual: float, expected: float) -> float:
    if expected == 0:
        return abs(actual - expected)
    return abs(actual - expected) / abs(expected)


def test_backview_mock_clip_golden() -> None:
    """Golden regression for the mock back-view pipeline clip."""

    frames = [np.zeros((720, 1280, 3), dtype=np.uint8) for _ in range(12)]
    calib = CalibrationParams(m_per_px=0.005, fps=120.0)

    result = analyze_frames(frames, calib, mock=True)
    metrics = result["metrics"]

    expected_ball_speed = 1.594
    expected_side_angle = 90.0
    expected_carry_est = 0.25

    assert _abs_pct_delta(metrics["ballSpeedMps"], expected_ball_speed) <= 0.03
    assert abs(metrics["sideAngleDeg"] - expected_side_angle) <= 1.5
    assert abs(metrics["carryEstM"] - expected_carry_est) <= 12.0
