from fastapi.testclient import TestClient

from server.app import app
from server.routes import cv_analyze_video
from server.storage.runs import RunRecord, RunStatus


def test_video_capture_metadata_is_persisted(monkeypatch):
    monkeypatch.setattr(cv_analyze_video, "MAX_VIDEO_BYTES", 1_000_000)

    def fake_frames(_, **__):
        return [object(), object(), object()]

    def fake_fps(_):
        return 120.0

    def fake_analyze(*_, **__):
        return {"events": [1], "metrics": {"confidence": 0.5}}

    captured: dict = {}

    def fake_create_run(**kwargs):
        captured["created"] = kwargs
        return RunRecord(
            run_id="vid-999",
            created_ts=1.0,
            updated_ts=1.0,
            status=RunStatus.PROCESSING,
            source=kwargs["source"],
            source_type=kwargs["source_type"],
            mode=kwargs["mode"],
            params=kwargs["params"],
            metrics=kwargs["metrics"],
            events=kwargs["events"],
            metadata=kwargs.get("metadata", {}),
        )

    def fake_update_run(run_id, **kwargs):
        captured["updated"] = {"run_id": run_id, **kwargs}
        return None

    monkeypatch.setattr(cv_analyze_video, "frames_from_video", fake_frames)
    monkeypatch.setattr(cv_analyze_video, "fps_from_video", fake_fps)
    monkeypatch.setattr(cv_analyze_video, "analyze_frames", fake_analyze)
    monkeypatch.setattr(cv_analyze_video, "create_run", fake_create_run)
    monkeypatch.setattr(cv_analyze_video, "update_run", fake_update_run)

    capture_payload = {
        "mode": "range",
        "fps": 120,
        "brightness": {"mean": 110, "verdict": "ok"},
        "blur": {"score": 150, "verdict": "ok"},
        "framingTipsShown": True,
        "issues": [],
        "okToRecordOrUpload": True,
    }
    payload = {"capture": '{"mode":"range","fps":120}'}
    payload["capture"] = __import__("json").dumps(capture_payload)

    with TestClient(app) as client:
        files = {"video": ("clip.mp4", b"0123456789", "video/mp4")}
        response = client.post("/cv/analyze/video", data=payload, files=files)

    assert response.status_code == 200, response.text
    assert captured["created"]["metadata"]["capture"] == capture_payload
