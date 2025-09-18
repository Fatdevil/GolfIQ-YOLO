from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_storage


def test_runs_not_found(tmp_path, monkeypatch):
    monkeypatch.setattr(runs_storage, "RUNS_DIR", tmp_path)
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))

    with TestClient(app) as client:
        list_response = client.get("/runs")
        assert list_response.status_code == 200
        assert list_response.json() == []

        get_response = client.get("/runs/missing")
        assert get_response.status_code == 404
        assert get_response.json() == {"detail": "run not found"}

        delete_response = client.delete("/runs/missing")
        assert delete_response.status_code == 404
        assert delete_response.json() == {"detail": "run not found"}
