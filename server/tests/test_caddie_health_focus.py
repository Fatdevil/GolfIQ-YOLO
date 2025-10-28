from typing import Any, Dict, Iterable

import pytest
from fastapi.testclient import TestClient

from server.app import app


@pytest.fixture
def focus_runs(monkeypatch):
    runs: Dict[str, list[dict[str, Any]]] = {
        "run-putt": [
            {
                "event": "hud.caddie.plan",
                "ts": 1000.0,
                "data": {
                    "focus": "putt",
                    "mcUsed": True,
                    "hadAdvice": True,
                    "ttsUsed": False,
                },
            },
            {"event": "hud.caddie.adopt", "ts": 1005.0, "data": {"adopted": True}},
            {
                "event": "hud.shot",
                "data": {
                    "sg": {"total": 0.6, "byFocus": {"putt": 0.6}},
                    "planAdopted": True,
                },
            },
        ],
        "run-long": [
            {
                "event": "hud.caddie.plan",
                "ts": 2000.0,
                "data": {
                    "focus": "long-drive",
                    "mcUsed": False,
                    "hadAdvice": False,
                    "ttsUsed": False,
                },
            },
            {"event": "hud.caddie.adopt", "ts": 2010.0, "data": {"adopted": False}},
            {
                "event": "hud.shot",
                "data": {
                    "sg": {"total": 1.2, "byFocus": {"long-drive": 1.2}},
                    "planAdopted": False,
                },
            },
        ],
    }

    def fake_iter_recent(_cutoff) -> Iterable[str]:
        return runs.keys()

    def fake_load(run_id: str):
        return runs[run_id]

    monkeypatch.setattr(
        "server.routes.caddie_health._iter_recent_hud_runs", fake_iter_recent
    )
    monkeypatch.setattr("server.routes.caddie_health._load_run_events", fake_load)

    return runs


def test_health_focus_breakdown(focus_runs):
    client = TestClient(app)

    response = client.get("/caddie/health")
    assert response.status_code == 200

    payload = response.json()
    sg_focus = payload["sg_gained_per_round_by_focus"]
    adoption = payload["adoption_by_focus"]

    assert set(sg_focus) >= {"putt", "long-drive"}
    assert sg_focus["putt"]["sample"] == 1
    assert sg_focus["putt"]["mean"] == pytest.approx(0.6)
    assert sg_focus["long-drive"]["sample"] == 1
    assert sg_focus["long-drive"]["mean"] == pytest.approx(1.2)

    assert adoption["putt"]["plans"] == 1
    assert adoption["putt"]["adopts"] == 1
    assert adoption["putt"]["adoptRate"] == pytest.approx(1.0)
    assert adoption["long-drive"]["plans"] == 1
    assert adoption["long-drive"]["adopts"] == 0
    assert adoption["long-drive"]["adoptRate"] == pytest.approx(0.0)
