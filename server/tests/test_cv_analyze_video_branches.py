import os

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import cv_analyze_video as video_module
from server.storage.runs import RunRecord


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def _video_file(data: bytes = b"fake"):
    return {"video": ("video.mp4", data, "video/mp4")}


def test_cv_analyze_video_requires_video_extras(monkeypatch, client):
    def _boom(*args, **kwargs):  # pragma: no cover - exercised via HTTPException path
        raise ImportError("extras missing")

    monkeypatch.setattr(video_module, "frames_from_video", _boom)

    response = client.post("/cv/analyze/video", data={}, files=_video_file())

    assert response.status_code == 400
    assert "Video extras not installed" in response.json()["detail"]


def test_cv_analyze_video_rejects_insufficient_frames(monkeypatch, client):
    monkeypatch.setattr(
        video_module,
        "frames_from_video",
        lambda data, max_frames=300, stride=1: [object()],
    )
    monkeypatch.setattr(video_module, "fps_from_video", lambda data: None)
    monkeypatch.setattr(
        video_module,
        "analyze_frames",
        lambda *args, **kwargs: pytest.fail("analyze should not run"),
    )

    response = client.post("/cv/analyze/video", data={}, files=_video_file())

    assert response.status_code == 400
    assert "not enough frames" in response.json()["detail"]


def test_cv_analyze_video_persists_run_when_requested(monkeypatch, client):
    monkeypatch.delenv("GOLFIQ_MOCK", raising=False)

    frames = [object(), object()]
    monkeypatch.setattr(
        video_module,
        "frames_from_video",
        lambda data, max_frames=300, stride=1: frames,
    )
    monkeypatch.setattr(video_module, "fps_from_video", lambda data: None)

    def _fake_analyze(frames_in, calib):
        assert frames_in == frames
        return {"events": [1, 2], "metrics": {}}

    monkeypatch.setattr(video_module, "analyze_frames", _fake_analyze)

    saved = {}

    def _fake_save_run(**kwargs):
        saved.update(kwargs)
        return RunRecord(
            run_id="1700000000-deadbeef",
            created_ts=1.0,
            source=kwargs["source"],
            mode=kwargs["mode"],
            params=kwargs["params"],
            metrics=kwargs["metrics"],
            events=kwargs["events"],
        )

    monkeypatch.setattr(video_module, "save_run", _fake_save_run)

    response = client.post(
        "/cv/analyze/video",
        data={"persist": "true", "run_name": "demo"},
        files=_video_file(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["events"] == [1, 2]
    assert body["run_id"] == "1700000000-deadbeef"
    assert body["metrics"]["confidence"] == 0.0
    assert os.environ["GOLFIQ_MOCK"] == "1"

    assert saved["params"]["run_name"] == "demo"
    assert saved["metrics"]["confidence"] == 0.0
    assert saved["events"] == [1, 2]
