from datetime import datetime, timezone
from typing import Any, Dict, Iterable

import pytest
from fastapi.testclient import TestClient

from server.app import app


@pytest.fixture
def fixed_now(monkeypatch):
    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            base = datetime(2025, 5, 15, tzinfo=timezone.utc)
            if tz is None:
                return base.replace(tzinfo=None)
            return base.astimezone(tz)

        @classmethod
        def utcnow(cls):
            return datetime(2025, 5, 15, tzinfo=timezone.utc)

    monkeypatch.setattr("server.routes.caddie_health.datetime", FixedDateTime)
    return datetime(2025, 5, 15, tzinfo=timezone.utc)


def test_focus_trend_empty(monkeypatch, fixed_now):
    def fake_iter_recent(_cutoff) -> Iterable[str]:
        return []

    monkeypatch.setattr(
        "server.routes.caddie_health._iter_recent_hud_runs", fake_iter_recent
    )

    client = TestClient(app)
    response = client.get("/caddie/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["sg_trend_by_focus"] == {}


def test_focus_trend_with_runs(monkeypatch, fixed_now):
    base_ts = fixed_now.timestamp()
    day = 24 * 60 * 60
    runs: Dict[str, list[dict[str, Any]]] = {
        "recent": [
            {
                "event": "hud.caddie.plan",
                "ts": base_ts - 2 * day,
                "data": {
                    "focus": "putt",
                    "mcUsed": True,
                    "hadAdvice": True,
                    "ttsUsed": False,
                },
            },
            {
                "event": "hud.shot",
                "ts": base_ts - 2 * day + 10,
                "data": {
                    "sg": {"total": 0.6, "byFocus": {"putt": 0.6}},
                },
            },
        ],
        "previous": [
            {
                "event": "hud.caddie.plan",
                "ts": base_ts - 9 * day,
                "data": {
                    "focus": "putt",
                    "mcUsed": True,
                    "hadAdvice": True,
                    "ttsUsed": False,
                },
            },
            {
                "event": "hud.shot",
                "ts": base_ts - 9 * day + 20,
                "data": {
                    "sg": {"total": 0.2, "byFocus": {"putt": 0.2}},
                },
            },
        ],
        "mid": [
            {
                "event": "hud.caddie.plan",
                "ts": base_ts - 20 * day,
                "data": {
                    "focus": "putt",
                    "mcUsed": True,
                    "hadAdvice": True,
                    "ttsUsed": False,
                },
            },
            {
                "event": "hud.shot",
                "ts": base_ts - 20 * day + 5,
                "data": {
                    "sg": {"total": -0.1, "byFocus": {"putt": -0.1}},
                },
            },
        ],
        "older": [
            {
                "event": "hud.caddie.plan",
                "ts": base_ts - 45 * day,
                "data": {
                    "focus": "putt",
                    "mcUsed": True,
                    "hadAdvice": True,
                    "ttsUsed": False,
                },
            },
            {
                "event": "hud.shot",
                "ts": base_ts - 45 * day + 3,
                "data": {
                    "sg": {"total": 0.05, "byFocus": {"putt": 0.05}},
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

    client = TestClient(app)
    response = client.get("/caddie/health")
    assert response.status_code == 200
    payload = response.json()

    trend = payload["sg_trend_by_focus"]
    assert "putt" in trend
    assert trend["putt"]["d7"] == pytest.approx(0.4, rel=1e-2)
    assert trend["putt"]["d30"] == pytest.approx(0.183, rel=1e-2)
