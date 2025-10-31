from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_caddie_health_empty_window_snapshot(monkeypatch) -> None:
    monkeypatch.setattr(
        "server.routes.caddie_health._iter_recent_hud_runs", lambda cutoff: []
    )

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "15m"})
    assert response.status_code == 200

    payload = response.json()

    assert payload["sg_gained_per_round"] == {"sample": 0, "mean": None, "median": None}
    assert payload["adoption_sg_lift"] is None
    assert payload["mc"]["enabledPct"] == 0.0
    assert payload["mc"]["hazardRate"] == 0.0
    assert payload["mc"]["ab"]["delta"] == {"adoptRate": 0.0, "sgPerRound": 0.0}
    assert payload["advice"]["ab"]["delta"] == {"adoptRate": 0.0, "sgPerRound": 0.0}
    assert payload["tts"]["ab"]["delta"] == {"playRate": 0.0, "sgPerRound": 0.0}
    assert payload["coach_weight_delta"] == 0.0
    assert payload["sg_lift_by_focus"] == {}
