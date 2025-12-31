from __future__ import annotations

import base64
from types import SimpleNamespace

import numpy as np
import pytest

from server.cv import range_analyze
from server.cv.range_analyze import CameraFitness, RangeAnalyzeIn


def test_camera_fitness_levels_and_reasons() -> None:
    data = {"fps": "warn", "lighting": "low", "homography": "good", "other": "noop"}
    fitness = range_analyze._camera_fitness_from_quality(data)
    assert isinstance(fitness, CameraFitness)
    assert fitness.level == "bad"
    assert fitness.score < 1.0
    assert fitness.reasons == ["fps_low", "light_low"]


def test_camera_fitness_none_when_empty() -> None:
    assert range_analyze._camera_fitness_from_quality(None) is None
    assert range_analyze._camera_fitness_from_quality({"fps": None}) is None


@pytest.mark.parametrize(
    "metrics,expected",
    [
        ({"ball_speed_mps": 42}, 42.0),
        ({"ballSpeedMps": 30.5}, 30.5),
        ({"ball_speed_mps": "nope"}, None),
    ],
)
def test_maybe_float(metrics, expected) -> None:
    assert (
        range_analyze._maybe_float(metrics, "ball_speed_mps", "ballSpeedMps")
        == expected
    )


def test_build_out_normalizes_fields() -> None:
    metrics = {
        "ballSpeedMps": 35.5,
        "clubSpeedMps": 40,
        "carryEstM": 192.3,
        "vertLaunchDeg": 17.2,
        "sideAngleDeg": -3.4,
        "quality": {"fps": "warn"},
    }
    out = range_analyze._build_out(metrics)
    assert out.ball_speed_mps == 35.5
    assert out.club_speed_mps == 40.0
    assert out.carry_m == 192.3
    assert out.launch_deg == 17.2
    assert out.side_deg == -3.4
    assert out.quality and out.quality.level == "warning"


def test_frames_from_payload_uses_zip(monkeypatch) -> None:
    frames = [np.ones((2, 2, 3), dtype=np.uint8) for _ in range(3)]

    def fake_frames_from_zip(data: bytes):
        assert base64.b64encode(data) == base64.b64encode(b"dummy")
        return frames

    monkeypatch.setattr(range_analyze, "frames_from_zip_bytes", fake_frames_from_zip)
    payload = RangeAnalyzeIn(
        frames=3, frames_zip_b64=base64.b64encode(b"dummy").decode()
    )

    result = range_analyze._frames_from_payload(payload)
    assert list(result) == frames


def test_frames_from_payload_falls_back_when_zip_sparse(monkeypatch) -> None:
    def fake_frames_from_zip(data: bytes):
        return [np.zeros((1, 1, 3), dtype=np.uint8)]

    monkeypatch.setattr(range_analyze, "frames_from_zip_bytes", fake_frames_from_zip)
    payload = RangeAnalyzeIn(
        frames=5,
        frame_width=20,
        frame_height=18,
        frames_zip_b64=base64.b64encode(b"dummy").decode(),
    )

    result = list(range_analyze._frames_from_payload(payload))
    assert len(result) == 5
    assert all(frame.shape == (18, 20, 3) for frame in result)


def test_frames_from_payload_generates_blank_frames() -> None:
    payload = RangeAnalyzeIn(frames=2, frame_width=24, frame_height=18)
    result = list(range_analyze._frames_from_payload(payload))
    assert len(result) == 2
    assert all(frame.shape == (18, 24, 3) for frame in result)


def test_run_mock_analyze_normalizes_response(monkeypatch) -> None:
    calls = {}

    def fake_request(**kwargs):
        calls["request"] = kwargs
        return SimpleNamespace()

    def fake_analyze(req):
        calls["analyze"] = req
        return SimpleNamespace(
            metrics={"ball_speed_mps": 22, "quality": {"lighting": "warn"}}
        )

    monkeypatch.setattr(range_analyze.cv_mock, "AnalyzeRequest", fake_request)
    monkeypatch.setattr(range_analyze.cv_mock, "analyze", fake_analyze)

    payload = RangeAnalyzeIn(frames=6, fps=100.0)
    out = range_analyze.run_mock_analyze(payload)

    assert "request" in calls and "analyze" in calls
    assert out.ball_speed_mps == 22.0
    assert out.quality and out.quality.level == "warning"


def test_run_real_analyze_uses_dependencies(monkeypatch) -> None:
    calls = {}

    def fake_from_reference(m, px, fps):
        calls["calib"] = (m, px, fps)
        return "calibration"

    def fake_frames(payload):
        calls["frames"] = payload
        return [np.zeros((2, 2, 3), dtype=np.uint8) for _ in range(2)]

    def fake_analyze(frames, calib, mock, smoothing_window, **kwargs):
        calls["analyze"] = (frames, calib, mock, smoothing_window, kwargs)
        return {
            "metrics": {
                "ballSpeedMps": 55.1,
                "quality": {"fps": "good"},
            }
        }

    monkeypatch.setattr(
        range_analyze.CalibrationParams,
        "from_reference",
        staticmethod(fake_from_reference),
    )
    monkeypatch.setattr(range_analyze, "_frames_from_payload", fake_frames)
    monkeypatch.setattr(range_analyze, "analyze_frames", fake_analyze)

    payload = RangeAnalyzeIn(smoothing_window=5)
    out = range_analyze.run_real_analyze(payload)

    assert calls["calib"] == (payload.ref_len_m, payload.ref_len_px, payload.fps)
    assert calls["frames"] == payload
    frames, calib, mock_flag, smoothing, kwargs = calls["analyze"]
    assert mock_flag is False
    assert smoothing == 5
    assert kwargs.get("model_variant") is None
    assert out.ball_speed_mps == 55.1
    assert out.quality and out.quality.level == "good"
