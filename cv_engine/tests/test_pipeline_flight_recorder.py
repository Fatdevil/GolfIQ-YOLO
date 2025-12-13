import numpy as np

from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames


def _run_pipeline(monkeypatch, enable: bool):
    if enable:
        monkeypatch.setenv("CV_FLIGHT_RECORDER_ENABLED", "1")
    else:
        monkeypatch.delenv("CV_FLIGHT_RECORDER_ENABLED", raising=False)
    frames = [np.zeros((16, 16, 3), dtype=np.uint8) for _ in range(3)]
    calib = CalibrationParams.from_reference(1.0, 100.0, 120.0)
    return analyze_frames(frames, calib, mock=True, smoothing_window=1)


def test_pipeline_attaches_flight_recorder(monkeypatch):
    result = _run_pipeline(monkeypatch, enable=True)
    telemetry = result.get("flight_recorder")
    assert telemetry is not None
    summary = telemetry.get("summary")
    assert summary is not None
    assert summary.get("frameCount") == 3
    assert summary.get("shotCount") >= 0


def test_pipeline_skips_flight_recorder_when_disabled(monkeypatch):
    result = _run_pipeline(monkeypatch, enable=False)
    assert result.get("flight_recorder") is None
