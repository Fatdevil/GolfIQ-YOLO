import json

from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_storage


def test_runs_persist_flow(tmp_path, monkeypatch):
    runs_storage._reset_store_for_tests(tmp_path)
    monkeypatch.setenv("RUN_STORE_DIR", str(tmp_path))

    fixed_ts = 1_700_000_000.0
    monkeypatch.setattr(runs_storage.time, "time", lambda: fixed_ts)
    monkeypatch.setattr(
        runs_storage.uuid,
        "uuid4",
        lambda: runs_storage.uuid.UUID("00000000-0000-0000-0000-000000000123"),
    )

    with TestClient(app) as client:
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
        response = client.post("/cv/mock/analyze", json=payload)
        assert response.status_code == 200, response.text

        data = response.json()
        run_id = data["run_id"]
        assert run_id == "00000000-0000-0000-0000-000000000123"

        run_dir = tmp_path / run_id
        assert run_dir.is_dir()
        run_json = json.loads((run_dir / "run.json").read_text())
        assert run_json["created_ts"] == fixed_ts
        assert run_json["source"] == "mock"
        assert run_json["mode"] == "detector"
        assert run_json["params"]["persist"] is True
        assert run_json["events"] == data["events"]
        assert run_json["status"] == "succeeded"

        detail_response = client.get(f"/runs/{run_id}")
        assert detail_response.status_code == 200
        detail = detail_response.json()
        assert detail["run_id"] == run_id
        assert detail["status"] == "succeeded"

        list_response = client.get("/runs", params={"limit": 5, "offset": 0})
        assert list_response.status_code == 200
        run_list = list_response.json()
        assert len(run_list) == 1
        item = run_list[0]
        assert item["run_id"] == run_id
        assert item["source"] == "mock"
        assert item["status"] == "succeeded"
