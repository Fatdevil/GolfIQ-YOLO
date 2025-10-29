from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, Iterable, List

from fastapi.testclient import TestClient

from server.app import app
from server.routes import caddie_health

client = TestClient(app)


def test_learning_metrics_aggregated(monkeypatch) -> None:
    def fake_iter(_: timedelta) -> Iterable[str]:
        return ["run-a"]

    def fake_load(_: str) -> List[Dict[str, Any]]:
        return [
            {
                "event": "coach.profile.updated",
                "data": {
                    "dWeights": {"putt": 0.2, "approach": -0.1},
                    "sgLiftByFocus": {"putt": 0.6},
                },
            },
            {
                "event": "hud.caddie.plan",
                "data": {
                    "mcUsed": True,
                    "hadAdvice": True,
                    "ttsUsed": False,
                    "focus": "putt",
                    "adviceText": [],
                },
            },
        ]

    monkeypatch.setattr(caddie_health, "_runs_root", lambda: None)
    monkeypatch.setattr(caddie_health, "_iter_recent_hud_runs", fake_iter)
    monkeypatch.setattr(caddie_health, "_load_run_events", fake_load)

    response = client.get("/caddie/health?since=1d")
    assert response.status_code == 200
    data = response.json()
    assert data["coach_weight_delta"] > 0
    assert abs(data["sg_lift_by_focus"]["putt"] - 0.6) < 1e-6
