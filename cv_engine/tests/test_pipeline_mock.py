import os
import numpy as np
from cv_engine.pipeline.analyze import analyze_frames
from cv_engine.metrics.kinematics import CalibrationParams

def test_pipeline_detector_mock_motion_produces_metrics():
    os.environ["GOLFIQ_MOCK"] = "1"
    os.environ["GOLFIQ_MOTION_DX_BALL"] = "2.0"
    os.environ["GOLFIQ_MOTION_DY_BALL"] = "-1.0"
    os.environ["GOLFIQ_MOTION_DX_CLUB"] = "1.5"
    os.environ["GOLFIQ_MOTION_DY_CLUB"] = "0.0"

    frames = [np.zeros((64,64,3), dtype=np.uint8) for _ in range(10)]
    calib = CalibrationParams.from_reference(1.0, 100.0, 120.0)
    out = analyze_frames(frames, calib)
    m = out["metrics"]
    assert abs(m["ball_speed_mps"] - 2.68) < 0.2
    assert 5.7 <= m["ball_speed_mph"] <= 6.3
    assert 25.0 <= m["launch_deg"] <= 28.5
