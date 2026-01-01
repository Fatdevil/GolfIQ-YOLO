from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_storage
from server.storage.runs import RunSourceType, RunStatus


def test_runs_v1_detail_success(tmp_path, timewarp):
    runs_storage._reset_store_for_tests(tmp_path)
    with TestClient(app) as client:
        run = runs_storage.create_run(
            run_id="11111111-1111-1111-1111-111111111111",
            source="test",
            source_type=RunSourceType.ANALYZE.value,
            mode="detector",
            status=RunStatus.PROCESSING,
            params={"foo": "bar"},
            metrics={},
            events=[],
            input_ref={"type": "zip", "filename": "frames.zip"},
        )

        timewarp(1.0)
        runs_storage.update_run(
            run.run_id,
            status=RunStatus.SUCCEEDED,
            metrics={"ok": True},
            inference_timing={"total_ms": 10.0, "frames": 2},
        )

        response = client.get(f"/runs/v1/{run.run_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["run_id"] == run.run_id
        assert body["status"] == RunStatus.SUCCEEDED.value
        assert body["metrics"]["ok"] is True
        assert body["input_ref"]["filename"] == "frames.zip"
        assert body["timings"]["total_ms"] == 10.0
        assert body["started_at"] is not None
        assert body["finished_at"] is not None


def test_runs_v1_detail_not_found(tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    with TestClient(app) as client:
        response = client.get("/runs/v1/missing-run-id")
    assert response.status_code == 404
    assert response.json() == {
        "detail": {
            "run_id": "missing-run-id",
            "error_code": "RUN_NOT_FOUND",
            "message": "Run not found",
        }
    }
