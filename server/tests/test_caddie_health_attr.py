from __future__ import annotations

from typing import Dict, List

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import caddie_health


def _setup_runs(
    monkeypatch: pytest.MonkeyPatch, mapping: Dict[str, List[dict]]
) -> None:
    def _iter_stub(_cutoff):
        return list(mapping.keys())

    def _load_stub(run_id: str):
        return mapping.get(run_id, [])

    monkeypatch.setattr(caddie_health, "_iter_recent_hud_runs", _iter_stub)
    monkeypatch.setattr(caddie_health, "_load_run_events", _load_stub)


def test_adoption_attributed_with_recent_plan(monkeypatch):
    mapping = {
        "run-1": [
            {
                "event": "hud.caddie.plan",
                "timestampMs": 1000,
                "data": {
                    "mcUsed": True,
                    "adviceText": ["+1 club"],
                },
            },
            {
                "event": "hud.caddie.adopt",
                "timestampMs": 1100,
                "data": {"adopted": True},
            },
        ]
    }
    _setup_runs(monkeypatch, mapping)

    client = TestClient(app)
    response = client.get("/caddie/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mc"]["enabledPct"] == pytest.approx(100.0)
    assert payload["mc"]["adoptRate"] == pytest.approx(1.0)
    assert payload["advice"]["adoptRate"] == pytest.approx(1.0)


def test_adopt_without_plan_is_ignored(monkeypatch):
    mapping = {
        "run-1": [
            {
                "event": "hud.caddie.adopt",
                "timestampMs": 200,
                "data": {"adopted": True},
            }
        ]
    }
    _setup_runs(monkeypatch, mapping)

    client = TestClient(app)
    response = client.get("/caddie/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mc"]["enabledPct"] == pytest.approx(0.0)
    assert payload["mc"]["adoptRate"] == pytest.approx(0.0)
    assert payload["advice"]["adoptRate"] == pytest.approx(0.0)


def test_plan_and_adopt_in_different_runs_not_linked(monkeypatch):
    mapping = {
        "run-a": [
            {
                "event": "hud.caddie.plan",
                "timestampMs": 10,
                "data": {
                    "mcUsed": True,
                    "adviceText": ["+1 club"],
                },
            }
        ],
        "run-b": [
            {
                "event": "hud.caddie.adopt",
                "timestampMs": 20,
                "data": {"adopted": True},
            }
        ],
    }
    _setup_runs(monkeypatch, mapping)

    client = TestClient(app)
    response = client.get("/caddie/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mc"]["enabledPct"] == pytest.approx(100.0)
    assert payload["mc"]["adoptRate"] == pytest.approx(0.0)
    assert payload["advice"]["adoptRate"] == pytest.approx(0.0)


def test_latest_plan_wins_before_adopt(monkeypatch):
    mapping = {
        "run-1": [
            {
                "event": "hud.caddie.plan",
                "timestampMs": 50,
                "data": {
                    "mcUsed": False,
                    "adviceText": ["swing easy"],
                },
            },
            {
                "event": "hud.caddie.plan",
                "timestampMs": 80,
                "data": {
                    "mcUsed": True,
                    "adviceText": [],
                },
            },
            {
                "event": "hud.caddie.adopt",
                "timestampMs": 100,
                "data": {"adopted": True},
            },
        ]
    }
    _setup_runs(monkeypatch, mapping)

    client = TestClient(app)
    response = client.get("/caddie/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["mc"]["enabledPct"] == pytest.approx(50.0)
    assert payload["mc"]["adoptRate"] == pytest.approx(1.0)
    assert payload["advice"]["adoptRate"] == pytest.approx(0.0)
