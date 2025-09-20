import json
import os
import zipfile

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
