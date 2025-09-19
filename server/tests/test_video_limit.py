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
