from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from server.app import app

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def fresh_repository(monkeypatch: pytest.MonkeyPatch):
    events_module = importlib.import_module("server.routes.events")
    repository = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repository)
    return repository


def test_post_score_unknown_event_returns_404(fresh_repository):
    response = client.post(
        "/events/UNKNOWN-EVENT/score",
        json={
            "scorecardId": "sc-missing",
            "hole": 1,
            "gross": 4,
            "fingerprint": "fp-unknown",
            "revision": 1,
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "scorecard not found"


def test_register_players_unknown_event_returns_404(fresh_repository):
    response = client.post(
        "/events/UNKNOWN-EVENT/players",
        json={
            "players": [
                {
                    "scorecardId": "sc-missing",
                    "name": "Missing Player",
                }
            ]
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "event not found"
