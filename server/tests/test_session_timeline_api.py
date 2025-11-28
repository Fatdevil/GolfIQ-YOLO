import importlib

from fastapi.testclient import TestClient


def _reload_app():
    import server.app as fastapi_app

    return importlib.reload(fastapi_app)


def test_session_timeline_endpoint(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    from server.storage import runs as runs_mod

    runs = importlib.reload(runs_mod)
    run = runs.save_run(
        source="app",
        mode="play",
        params={"fps": 50.0},
        metrics={"sequence": {"hip_peak_frame": 10, "shoulder_peak_frame": 20}},
        events=[25],
    )

    fastapi_app = _reload_app()
    client = TestClient(fastapi_app.app, raise_server_exceptions=False)

    response = client.get(f"/api/session/{run.run_id}/timeline")
    assert response.status_code == 200
    payload = response.json()
    assert payload["runId"] == run.run_id
    assert payload["events"]


def test_session_timeline_endpoint_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    fastapi_app = _reload_app()
    client = TestClient(fastapi_app.app, raise_server_exceptions=False)

    response = client.get("/api/session/does-not-exist/timeline")
    assert response.status_code == 404
