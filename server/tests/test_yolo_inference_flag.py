import pytest
from fastapi.testclient import TestClient

from server import routes
from server.app import app


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def patched_video_dependencies(monkeypatch):
    module = routes.cv_analyze_video
    frames = [object(), object(), object()]

    def _fake_frames_from_video(data, max_frames=300, stride=1):
        return list(frames)

    monkeypatch.setattr(module, "frames_from_video", _fake_frames_from_video)
    monkeypatch.setattr(module, "fps_from_video", lambda data: 120.0)
    return module


def _post_video_request(client: TestClient):
    files = {"video": ("swing.mp4", b"fake-bytes", "video/mp4")}
    data = {
        "fps_fallback": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
        "smoothing_window": "3",
    }
    return client.post("/cv/analyze/video", data=data, files=files)


def test_cv_analyze_video_uses_mock_when_flag_disabled(
    client, patched_video_dependencies, monkeypatch
):
    monkeypatch.delenv("YOLO_INFERENCE", raising=False)
    captured = {}

    def _fake_analyze_frames(frames, calib, *, mock, smoothing_window):
        captured["mock"] = mock
        return {"events": [1], "metrics": {"confidence": 0.5}}

    monkeypatch.setattr(
        patched_video_dependencies, "analyze_frames", _fake_analyze_frames
    )

    response = _post_video_request(client)

    assert response.status_code == 200
    assert captured.get("mock") is True


def test_cv_analyze_video_uses_real_when_flag_enabled(
    client, patched_video_dependencies, monkeypatch
):
    monkeypatch.setenv("YOLO_INFERENCE", "true")
    captured = {}

    def _fake_analyze_frames(frames, calib, *, mock, smoothing_window):
        captured["mock"] = mock
        return {"events": [1], "metrics": {"confidence": 0.5}}

    monkeypatch.setattr(
        patched_video_dependencies, "analyze_frames", _fake_analyze_frames
    )

    response = _post_video_request(client)

    assert response.status_code == 200
    assert captured.get("mock") is False
