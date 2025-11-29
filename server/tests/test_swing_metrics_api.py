from fastapi.testclient import TestClient

from server.app import app
from server.storage import runs as runs_module
from server.api.routers import swing_metrics as swing_metrics_router


def _setup_runs_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    runs_module.RUNS_DIR = tmp_path


def test_swing_metrics_api_returns_metrics_and_compare(monkeypatch, tmp_path):
    _setup_runs_dir(tmp_path, monkeypatch)

    def _fake_compare(metric, value, club=None):
        return {
            "band_group": "tour_male",
            "status": "in_range",
            "range_min": 0.0,
            "range_max": 100.0,
        }

    monkeypatch.setattr(swing_metrics_router, "compare_to_bands", _fake_compare)

    run = runs_module.save_run(
        source="test",
        mode="swing",
        params={"club": "driver"},
        metrics={
            "sequence": {
                "max_shoulder_rotation": 78.0,
                "max_hip_rotation": 40.0,
                "max_x_factor": 38.0,
            },
            "faceon": {
                "sway_px": 12.3,
                "sway_cm": 3.4,
                "shoulder_tilt_deg": None,
                "shaft_lean_deg": None,
            },
            "launch_deg": 12.5,
            "sideAngleDeg": -1.2,
            "carry_m": 230.0,
        },
        events=[],
    )

    with TestClient(app) as client:
        resp = client.get(f"/api/swing/{run.run_id}/metrics")

    assert resp.status_code == 200
    body = resp.json()
    assert body["run_id"] == run.run_id
    assert body["club"] == "driver"
    assert body["metrics"]["max_shoulder_rotation"]["value"] == 78.0
    assert body["metrics"]["sway_px"]["units"] == "px"
    assert body["tour_compare"]["max_shoulder_rotation"]["status"] == "in_range"


def test_swing_metrics_api_handles_missing_run():
    with TestClient(app) as client:
        resp = client.get("/api/swing/123/metrics")
    assert resp.status_code == 404
