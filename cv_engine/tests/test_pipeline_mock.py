import numpy as np

from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames


def test_pipeline_detector_mock_motion_produces_metrics():
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(10)]
    calib = CalibrationParams.from_reference(1.0, 100.0, 120.0)
    out = analyze_frames(
        frames,
        calib,
        mock=True,
        motion=(2.0, -1.0, 1.5, 0.0),
    )
    m = out["metrics"]
    assert abs(m["ball_speed_mps"] - 2.41) < 0.2
    assert 5.3 <= m["ball_speed_mph"] <= 5.5
    assert 32.0 <= m["launch_deg"] <= 34.5
