from fastapi.testclient import TestClient

from server.app import app
from server.routes import cv_analyze_video


def test_video_size_guard(monkeypatch):
    monkeypatch.setattr(cv_analyze_video, "MAX_VIDEO_BYTES", 1024)
    payload = {}
    video_bytes = b"0" * 2048
    with TestClient(app) as client:
        files = {"video": ("clip.mp4", video_bytes, "video/mp4")}
        response = client.post("/cv/analyze/video", data=payload, files=files)
    assert response.status_code == 413


def test_video_header_length_guard(monkeypatch):
    monkeypatch.setattr(cv_analyze_video, "MAX_VIDEO_BYTES", 100)
    payload = {}
    video_bytes = b"0" * 10
    with TestClient(app) as client:
        files = {
            "video": (
                "clip.mp4",
                video_bytes,
                "video/mp4",
                {"Content-Length": "250"},
            )
        }
        response = client.post("/cv/analyze/video", data=payload, files=files)
    assert response.status_code == 413


def test_video_import_error(monkeypatch):
    monkeypatch.setattr(cv_analyze_video, "MAX_VIDEO_BYTES", 1024)

    def fake_frames(_, **__):
        raise ImportError("no video support")

    monkeypatch.setattr(cv_analyze_video, "frames_from_video", fake_frames)
    payload = {}
    video_bytes = b"0" * 10
    with TestClient(app) as client:
        files = {"video": ("clip.mp4", video_bytes, "video/mp4")}
        response = client.post("/cv/analyze/video", data=payload, files=files)
    assert response.status_code == 400


def test_video_requires_multiple_frames(monkeypatch):
    monkeypatch.setattr(cv_analyze_video, "MAX_VIDEO_BYTES", 1024)

    def fake_frames(_, **__):
        return [object()]

    monkeypatch.setattr(cv_analyze_video, "frames_from_video", fake_frames)
    payload = {}
    video_bytes = b"0" * 10
    with TestClient(app) as client:
        files = {"video": ("clip.mp4", video_bytes, "video/mp4")}
        response = client.post("/cv/analyze/video", data=payload, files=files)
    assert response.status_code == 400


def test_video_persist_adds_confidence(monkeypatch):
    monkeypatch.setattr(cv_analyze_video, "MAX_VIDEO_BYTES", 1_000_000)

    def fake_frames(_, **__):
        return [object(), object(), object()]

    def fake_fps(_):
        return None

    def fake_analyze(frames, calib, *, mock=True, smoothing_window):
        assert mock is True
        assert smoothing_window == 3
        return {"events": [42], "metrics": {}}

    class DummyRun:
        run_id = "vid-456"

    captured: dict = {}

    def fake_save_run(**kwargs):
        captured.update(kwargs)
        return DummyRun()

    monkeypatch.setattr(cv_analyze_video, "frames_from_video", fake_frames)
    monkeypatch.setattr(cv_analyze_video, "fps_from_video", fake_fps)
    monkeypatch.setattr(cv_analyze_video, "analyze_frames", fake_analyze)
    monkeypatch.setattr(cv_analyze_video, "save_run", fake_save_run)

    payload = {"persist": "true", "fps_fallback": "144"}
    video_bytes = b"0123456789"
    with TestClient(app) as client:
        files = {
            "video": (
                "clip.mp4",
                video_bytes,
                "video/mp4",
                {"Content-Length": "not-an-int"},
            )
        }
        response = client.post("/cv/analyze/video", data=payload, files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == "vid-456"
    assert body["metrics"]["confidence"] == 0.0
    assert captured["source"] == "video"
    assert captured["params"]["fps_fallback"] == 144.0
