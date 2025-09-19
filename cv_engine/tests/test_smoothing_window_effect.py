import math

import numpy as np

from cv_engine.calibration.simple import as_dict, measure_from_tracks
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames
from cv_engine.types import Box


def _box_from_center(cx: float, cy: float, label: str) -> Box:
    half = 2
    return Box(
        int(cx - half),
        int(cy - half),
        int(cx + half),
        int(cy + half),
        label,
        0.9,
    )


def test_smoothing_window_reduces_metric_error(monkeypatch):
    fps = 120.0
    calib = CalibrationParams.from_reference(1.0, 100.0, fps)
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(10)]

    base_ball = [(20 + i * 2.0, 40 - i * 1.0) for i in range(len(frames))]
    base_club = [(10 + i * 1.5, 50 - i * 0.2) for i in range(len(frames))]

    jitter = 4.0
    noisy_ball = [(x, y + ((-1) ** i) * jitter) for i, (x, y) in enumerate(base_ball)]
    noisy_club = [
        (x, y + ((-1) ** i) * (jitter / 2)) for i, (x, y) in enumerate(base_club)
    ]

    state = {"idx": 0}

    def fake_run(self, frame):
        idx = state["idx"]
        state["idx"] += 1
        return [
            _box_from_center(*noisy_ball[idx], "ball"),
            _box_from_center(*noisy_club[idx], "club"),
        ]

    monkeypatch.setattr("cv_engine.inference.yolo8.YoloV8Detector.run", fake_run)

    baseline = as_dict(measure_from_tracks(base_ball, base_club, calib))

    state["idx"] = 0
    unsmoothed = analyze_frames(frames, calib, smoothing_window=1)["metrics"]
    state["idx"] = 0
    smoothed = analyze_frames(frames, calib, smoothing_window=5)["metrics"]

    assert math.isfinite(unsmoothed["launch_deg"])
    assert math.isfinite(smoothed["launch_deg"])

    assert abs(smoothed["ball_speed_mps"] - baseline["ball_speed_mps"]) < abs(
        unsmoothed["ball_speed_mps"] - baseline["ball_speed_mps"]
    )
    assert abs(smoothed["launch_deg"] - baseline["launch_deg"]) < abs(
        unsmoothed["launch_deg"] - baseline["launch_deg"]
    )
