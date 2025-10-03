from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Sequence

import numpy as np

from cv_engine.inference.yolo8 import YoloV8Detector
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import _centers_by_label, analyze_frames

ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"
METRICS_PATH = ASSETS_DIR / "backview_golden_metrics.json"


def _generate_golden_frames(frame_count: int = 12) -> np.ndarray:
    """Generate a deterministic synthetic clip for golden regression."""

    height, width = 120, 160
    frames = np.zeros((frame_count, height, width, 3), dtype=np.uint8)
    for idx in range(frame_count):
        frame = frames[idx]
        # Draw a tiny "ball" patch that loosely follows the mock detector path so
        # we still exercise rendering code paths if visualized when debugging.
        cx = min(width - 3, max(0, int(width * 0.48) + idx * 2))
        cy = min(height - 3, max(0, int(height * 0.52) - idx))
        frame[cy : cy + 3, cx : cx + 3] = 255
    return frames


def _compute_side_angle_deg(frames: Sequence[np.ndarray]) -> float:
    detector = YoloV8Detector(mock=True)
    boxes_per_frame = [detector.run(frame) for frame in frames]
    track = []
    for boxes in boxes_per_frame:
        centers = _centers_by_label(boxes)
        if centers["ball"]:
            track.append(centers["ball"][0])
    if len(track) < 2:
        return 0.0
    (x0, y0), (x1, y1) = track[0], track[-1]
    dx = x1 - x0
    dy = y1 - y0
    return math.degrees(math.atan2(dx, abs(dy) + 1e-6))


def test_backview_pipeline_golden_regression() -> None:
    frames = _generate_golden_frames()
    with METRICS_PATH.open("r", encoding="utf-8") as fh:
        expected = json.load(fh)

    calib = CalibrationParams(m_per_px=0.01, fps=120.0)
    result = analyze_frames(frames, calib, mock=True)
    metrics = result["metrics"]

    ball_speed_mps = metrics["ball_speed_mps"]
    side_angle_deg = _compute_side_angle_deg(frames)
    carry_est_m = metrics["carry_m"]

    assert abs(ball_speed_mps - expected["ballSpeedMps"]) <= expected["ballSpeedMps"] * 0.03
    assert abs(side_angle_deg - expected["sideAngleDeg"]) <= 1.5
    assert abs(carry_est_m - expected["carryEstM"]) <= 12.0
