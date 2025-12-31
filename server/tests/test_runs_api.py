from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_storage


def test_runs_lifecycle(monkeypatch, tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    with TestClient(app) as client:
        assert client.get("/runs").status_code == 200
        payload = {
            "mode": "detector",
            "frames": 6,
            "fps": 120.0,
            "ref_len_m": 1.0,
            "ref_len_px": 100.0,
            "ball_dx_px": 2.0,
            "ball_dy_px": -1.0,
            "club_dx_px": 1.5,
            "club_dy_px": 0.0,
            "persist": True,
        }
        r = client.post("/cv/mock/analyze", json=payload)
        assert r.status_code == 200
        rid = r.json().get("run_id")
        assert rid
        assert any(it["run_id"] == rid for it in client.get("/runs").json())
        assert client.get(f"/runs/{rid}").status_code == 200
        assert client.delete(f"/runs/{rid}").status_code == 200
