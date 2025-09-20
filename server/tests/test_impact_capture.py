import json
import os
import zipfile

import numpy as np
from fastapi.testclient import TestClient

from server.app import app
from server.routes import cv_mock
from server.storage import runs as runs_storage


def test_impact_preview_zip_saved(tmp_path, monkeypatch):
    runs_dir = (tmp_path / "runs").resolve()
    monkeypatch.setattr(runs_storage, "RUNS_DIR", runs_dir)
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(runs_dir))
    monkeypatch.setenv("CAPTURE_IMPACT_FRAMES", "1")

    class FakeEvent:
        frame_index = 3

    class FakeImpactDetector:
        def __init__(self, *args, **kwargs):  # pragma: no cover - simple stub
            pass

        def run(self, frames):
            return [FakeEvent()]

    monkeypatch.setattr(cv_mock, "ImpactDetector", FakeImpactDetector)
    with TestClient(app) as client:
        response = client.post(
            "/cv/mock/analyze",
            json={"frames": 8, "fps": 120.0, "persist": True},
        )
    assert response.status_code == 200
    run_id = response.json().get("run_id")
    assert run_id
    run_json_path = runs_dir / run_id / "run.json"
    data = json.loads(run_json_path.read_text())
    preview_path = data.get("impact_preview")
    assert preview_path and os.path.exists(preview_path)
    with zipfile.ZipFile(preview_path, "r") as zf:
        assert any(name.endswith(".npy") for name in zf.namelist())


def test_save_impact_frames_filters_invalid_frames(tmp_path, monkeypatch):
    runs_dir = (tmp_path / "runs").resolve()
    monkeypatch.setattr(runs_storage, "RUNS_DIR", runs_dir)
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(runs_dir))

    class FailingFrame:
        def __array__(self, dtype=None):
            raise RuntimeError("nope")

    valid = np.zeros((2, 2), dtype=np.uint8)
    object_frame = np.array([object()], dtype=object)

    out = runs_storage.save_impact_frames(
        "1234567890-deadbeef", [FailingFrame(), object_frame, valid]
    )

    with zipfile.ZipFile(out, "r") as zf:
        names = zf.namelist()

    assert names == ["002.npy"]
