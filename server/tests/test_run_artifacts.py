import json
import zipfile
from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_storage
from server.storage.runs import RunStatus


def _zip_bytes() -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("0.npy", b"0")
        zf.writestr("1.npy", b"0")
    buf.seek(0)
    return buf.getvalue()


def test_analyze_creates_run(monkeypatch, tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    monkeypatch.setenv("RUN_STORE_DIR", str(tmp_path))
    monkeypatch.setattr(
        "server.routes.cv_analyze.frames_from_zip_bytes",
        lambda _: [np.zeros((2, 2)), np.zeros((2, 2))],
    )

    def fake_analyze(frames, calib, **__):
        return {
            "events": [0],
            "metrics": {
                "confidence": 0.9,
                "inference": {
                    "totalInferenceMs": 5.0,
                    "avgInferenceMs": 2.5,
                    "frames": len(frames),
                },
            },
        }

    monkeypatch.setattr("server.routes.cv_analyze.analyze_frames", fake_analyze)

    with TestClient(app) as client:
        files = {"frames_zip": ("frames.zip", _zip_bytes(), "application/zip")}
        response = client.post("/cv/analyze", files=files)

    assert response.status_code == 200, response.text
    body = response.json()
    run_id = body["run_id"]
    run_json = json.loads((tmp_path / run_id / "run.json").read_text())
    assert run_json["status"] == "succeeded"
    assert run_json["inference_timing"]["total_ms"] == 5.0
    assert run_json["model_variant_selected"] == "yolov10"


def test_analyze_marks_failed_for_yolov11(monkeypatch, tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    monkeypatch.setenv("RUN_STORE_DIR", str(tmp_path))
    monkeypatch.setattr(
        "server.routes.cv_analyze.frames_from_zip_bytes",
        lambda _: [np.zeros((2, 2)), np.zeros((2, 2))],
    )

    def fake_analyze(*args, **__):
        raise RuntimeError("YOLOv11 not wired; use yolov10")

    monkeypatch.setattr("server.routes.cv_analyze.analyze_frames", fake_analyze)

    with TestClient(app) as client:
        files = {"frames_zip": ("frames.zip", _zip_bytes(), "application/zip")}
        response = client.post(
            "/cv/analyze",
            params={"model_variant": "yolov11"},
            files=files,
        )

    assert response.status_code == 503
    detail = response.json()["detail"]
    run_id = detail["run_id"]
    run_json = json.loads((tmp_path / run_id / "run.json").read_text())
    assert run_json["status"] == "failed"
    assert run_json["error_code"] == "YOLOV11_UNAVAILABLE"


def test_runs_list_order(monkeypatch, tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    monkeypatch.setenv("RUN_STORE_DIR", str(tmp_path))
    times = [100.0, 200.0]

    def _time_seq():
        return times.pop(0) if times else 200.0

    monkeypatch.setattr(runs_storage.time, "time", _time_seq)
    _ = runs_storage.create_run(
        source="mock",
        source_type="analyze",
        status=RunStatus.SUCCEEDED,
        mode="detector",
        params={},
        metrics={},
        events=[],
    )
    second = runs_storage.create_run(
        source="mock",
        source_type="analyze",
        status=RunStatus.SUCCEEDED,
        mode="detector",
        params={},
        metrics={},
        events=[],
    )

    with TestClient(app) as client:
        resp = client.get("/runs", params={"limit": 1})
    assert resp.status_code == 200
    items = resp.json()
    assert items[0]["run_id"] == second.run_id
    assert items[0]["status"] == RunStatus.SUCCEEDED.value


def test_get_run_404(tmp_path, monkeypatch):
    runs_storage._reset_store_for_tests(tmp_path)
    monkeypatch.setenv("RUN_STORE_DIR", str(tmp_path))
    with TestClient(app) as client:
        resp = client.get("/runs/does-not-exist")
    assert resp.status_code == 404
