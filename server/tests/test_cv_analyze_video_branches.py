import os

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import cv_analyze, cv_analyze_video as video_module
from server.storage.runs import RunRecord, RunSourceType, RunStatus


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def _video_file(data: bytes = b"fake"):
    return {"video": ("video.mp4", data, "video/mp4")}


def _spy_runs(monkeypatch, run_id: str = "run-123"):
    saved: dict = {}

    def _fake_create_run(**kwargs):
        saved["created"] = kwargs
        return RunRecord(
            run_id=run_id,
            created_ts=1.0,
            updated_ts=1.0,
            status=kwargs.get("status", RunStatus.PROCESSING),
            source=kwargs.get("source", "mock"),
            source_type=kwargs.get("source_type", RunSourceType.ANALYZE_VIDEO.value),
            mode=kwargs.get("mode"),
            params=kwargs.get("params", {}),
            metrics=kwargs.get("metrics", {}),
            events=kwargs.get("events", []),
            model_variant_requested=kwargs.get("model_variant_requested"),
            model_variant_selected=kwargs.get("model_variant_selected"),
            override_source=kwargs.get("override_source", "none"),
            input_ref=kwargs.get("input_ref"),
            metadata=kwargs.get("metadata", {}),
        )

    def _fake_update_run(run_id_arg, **kwargs):
        saved["updated"] = {"run_id": run_id_arg, **kwargs}
        return saved.get("created")

    monkeypatch.setattr(video_module, "create_run", _fake_create_run)
    monkeypatch.setattr(cv_analyze, "update_run", _fake_update_run)
    return saved


def test_cv_analyze_video_requires_video_extras(monkeypatch, client):
    def _boom(*args, **kwargs):  # pragma: no cover - exercised via HTTPException path
        raise ImportError("extras missing")

    monkeypatch.setattr(video_module, "frames_from_video", _boom)

    response = client.post("/cv/analyze/video", data={}, files=_video_file())

    assert response.status_code == 400
    body = response.json()["detail"]
    assert body["error_code"] == "VIDEO_DECODE_DEP_MISSING"
    assert "Video extras not installed" in body["message"]
    assert body["run_id"]


def test_cv_analyze_video_handles_decode_runtime_error(monkeypatch, client):
    saved = _spy_runs(monkeypatch, run_id="decode-rt")

    def _boom(*args, **kwargs):
        raise RuntimeError("decode blew up")

    monkeypatch.setattr(video_module, "frames_from_video", _boom)

    response = client.post("/cv/analyze/video", data={}, files=_video_file())

    assert response.status_code == 400
    body = response.json()["detail"]
    assert body == {
        "error_code": "VIDEO_DECODE_FAILED",
        "message": "Could not decode video: decode blew up",
        "run_id": "decode-rt",
    }
    assert saved["updated"]["run_id"] == "decode-rt"
    assert saved["updated"]["error_code"] == "VIDEO_DECODE_FAILED"
    assert saved["updated"]["status"] == RunStatus.FAILED


def test_cv_analyze_video_handles_decode_unknown_error(monkeypatch, client):
    saved = _spy_runs(monkeypatch, run_id="decode-err")

    def _boom(*args, **kwargs):
        raise Exception("unexpected decode failure")

    monkeypatch.setattr(video_module, "frames_from_video", _boom)

    response = client.post("/cv/analyze/video", data={}, files=_video_file())

    assert response.status_code == 400
    body = response.json()["detail"]
    assert body == {
        "error_code": "VIDEO_DECODE_ERROR",
        "message": "Video decode error",
        "run_id": "decode-err",
    }
    assert saved["updated"]["run_id"] == "decode-err"
    assert saved["updated"]["error_code"] == "VIDEO_DECODE_ERROR"
    assert saved["updated"]["status"] == RunStatus.FAILED


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
    assert "not enough frames" in response.json()["detail"]["message"]


def test_cv_analyze_video_persists_run_when_requested(monkeypatch, client):
    monkeypatch.delenv("GOLFIQ_MOCK", raising=False)

    frames = [object(), object()]
    monkeypatch.setattr(
        video_module,
        "frames_from_video",
        lambda data, max_frames=300, stride=1: frames,
    )
    monkeypatch.setattr(video_module, "fps_from_video", lambda data: None)

    def _fake_analyze(frames_in, calib, smoothing_window=None, **kwargs):
        assert frames_in == frames
        return {"events": [1, 2], "metrics": {}}

    monkeypatch.setattr(video_module, "analyze_frames", _fake_analyze)

    saved: dict = {}

    def _fake_create_run(**kwargs):
        saved["created"] = kwargs
        return RunRecord(
            run_id="1700000000-deadbeef",
            created_ts=1.0,
            updated_ts=1.0,
            status=RunStatus.PROCESSING,
            source=kwargs["source"],
            source_type=kwargs["source_type"],
            mode=kwargs["mode"],
            params=kwargs["params"],
            metrics=kwargs["metrics"],
            events=kwargs["events"],
        )

    def _fake_update_run(run_id, **kwargs):
        saved["updated"] = {"run_id": run_id, **kwargs}
        return saved.get("created")

    monkeypatch.setattr(video_module, "create_run", _fake_create_run)
    monkeypatch.setattr(video_module, "update_run", _fake_update_run)

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
    assert "GOLFIQ_MOCK" not in os.environ

    assert saved["created"]["params"]["run_name"] == "demo"
    assert saved["updated"]["metrics"]["confidence"] == 0.0
    assert saved["updated"]["events"] == [1, 2]
    assert saved["created"]["source_type"] == RunSourceType.ANALYZE_VIDEO.value
