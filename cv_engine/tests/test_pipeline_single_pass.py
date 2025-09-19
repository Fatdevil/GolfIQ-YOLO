import numpy as np

from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames


def test_single_pass_detector(monkeypatch):
    frames = [np.zeros((32, 32, 3), dtype=np.uint8) for _ in range(6)]
    calib = CalibrationParams.from_reference(1.0, 100.0, 120.0)

    call_counter = {"count": 0}

    def fake_run(self, frame):
        call_counter["count"] += 1
        return []

    monkeypatch.setattr("cv_engine.inference.yolo8.YoloV8Detector.run", fake_run)

    analyze_frames(frames, calib)

    assert call_counter["count"] == len(frames)
