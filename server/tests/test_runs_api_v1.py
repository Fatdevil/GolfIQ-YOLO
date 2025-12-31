import io

from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_storage
from server.storage.runs import RunSourceType, RunStatus


def _make_run(run_id: str, status: RunStatus) -> None:
    runs_storage.create_run(
        run_id=run_id,
        source="test",
        source_type=RunSourceType.ANALYZE.value,
        mode="detector",
        status=status,
        params={},
        metrics={},
        events=[],
    )


def test_runs_v1_filters_by_status(monkeypatch, tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    with TestClient(app) as client:
        _make_run("succeeded-run", RunStatus.SUCCEEDED)
        _make_run("failed-run", RunStatus.FAILED)

        response = client.get("/runs/v1", params={"status": "succeeded"})
        assert response.status_code == 200
        payload = response.json()

        returned_ids = [item["run_id"] for item in payload["items"]]
        assert "succeeded-run" in returned_ids
        assert "failed-run" not in returned_ids


def test_runs_v1_paginates_newest_first(tmp_path, timewarp):
    runs_storage._reset_store_for_tests(tmp_path)
    advance = timewarp
    with TestClient(app) as client:
        _make_run("run-1", RunStatus.SUCCEEDED)
        advance(1.0)
        _make_run("run-2", RunStatus.PROCESSING)
        advance(1.0)
        _make_run("run-3", RunStatus.FAILED)

        first_page = client.get("/runs/v1", params={"limit": 2})
        assert first_page.status_code == 200
        payload = first_page.json()
        assert [item["run_id"] for item in payload["items"]] == ["run-3", "run-2"]
        assert payload["next_cursor"]

        second_page = client.get(
            "/runs/v1", params={"limit": 2, "cursor": payload["next_cursor"]}
        )
        assert second_page.status_code == 200
        payload2 = second_page.json()
        assert [item["run_id"] for item in payload2["items"]] == ["run-1"]
        assert payload2["next_cursor"] is None


def test_cv_analyze_failure_returns_run_error(monkeypatch, tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    with TestClient(app) as client:
        files = {
            "frames_zip": ("frames.zip", io.BytesIO(b"notazip"), "application/zip")
        }
        response = client.post("/cv/analyze", files=files)

        assert response.status_code == 400
        payload = response.json()
        assert set(payload) == {"run_id", "error_code", "message"}
        assert payload["error_code"] == "INVALID_ZIP"
        assert payload["run_id"]

        stored = runs_storage.get_run(payload["run_id"])
        assert stored is not None
        assert stored.status == RunStatus.FAILED
