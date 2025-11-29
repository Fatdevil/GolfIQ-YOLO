from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_storage


def test_create_mobile_run(monkeypatch, tmp_path):
    monkeypatch.setattr(runs_storage, "RUNS_DIR", tmp_path)
    client = TestClient(app)

    response = client.post(
        "/api/mobile/runs",
        json={
            "courseId": "c1",
            "courseName": "Pebble",
            "teeId": "t1",
            "teeName": "Blue",
            "holes": 18,
            "startedAt": "2024-01-01T00:00:00Z",
            "mode": "strokeplay",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "runId" in body
    run_dir = tmp_path / body["runId"]
    assert (run_dir / "run.json").exists()
