from __future__ import annotations

import importlib
from typing import List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.telemetry import events as telemetry_events


client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_env_and_repo(monkeypatch):
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)
    yield repo


@pytest.fixture
def telemetry_sink():
    captured: List[Tuple[str, dict]] = []

    def _emit(name: str, payload):
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    yield captured
    telemetry_events.set_events_telemetry_emitter(None)


def test_create_event_returns_qr_svg(monkeypatch, telemetry_sink):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "qr_svg", lambda _: "<svg>qr</svg>")
    valid_code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: valid_code)

    response = client.post("/events", json={"name": "Club Night", "emoji": "🏌️"})
    assert response.status_code == 201
    body = response.json()
    assert body["code"] == valid_code
    assert body["joinUrl"].endswith(f"/join/{valid_code}")
    assert body["qrSvg"] == "<svg>qr</svg>"
    assert any(event == "events.create" for event, _ in telemetry_sink)


def test_create_event_without_qr(monkeypatch, telemetry_sink):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "qr_svg", lambda _: None)
    valid_code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: valid_code)

    response = client.post("/events", json={"name": "League Day"})
    assert response.status_code == 201
    body = response.json()
    assert body["code"] == valid_code
    assert body["joinUrl"].endswith(f"/join/{valid_code}")
    assert "qrSvg" not in body
    assert any(event == "events.create" for event, _ in telemetry_sink)


def test_join_event_validates_code_format():
    response = client.post("/join/AAAAAAI", json={})
    assert response.status_code == 400


def test_join_event_success(monkeypatch, telemetry_sink):
    events_module = importlib.import_module("server.routes.events")
    valid_code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: valid_code)
    create_response = client.post("/events", json={"name": "Championship"})
    event_id = create_response.json()["id"]

    join_response = client.post(f"/join/{valid_code}", json={"name": "Spectator"})
    assert join_response.status_code == 200
    body = join_response.json()
    assert body["eventId"] == event_id
    assert any(event == "events.join" for event, _ in telemetry_sink)


def test_board_sanitizes_hidden_fields(monkeypatch, telemetry_sink):
    events_module = importlib.import_module("server.routes.events")
    valid_code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: valid_code)
    create_response = client.post("/events", json={"name": "Qualifier"})
    event_id = create_response.json()["id"]

    board_response = client.get(f"/events/{event_id}/board")
    assert board_response.status_code == 200
    board = board_response.json()
    assert "players" in board
    for player in board.get("players", []):
        assert set(player.keys()) <= {"name", "gross", "net", "thru", "hole", "status"}
    assert all(event != "events.resync" for event, _ in telemetry_sink)


def test_missing_board_triggers_resync(monkeypatch, telemetry_sink):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(
        events_module, "_REPOSITORY", events_module._MemoryEventsRepository()
    )

    response = client.get("/events/00000000-0000-0000-0000-000000000000/board")
    assert response.status_code == 200
    assert any(event == "events.resync" for event, _ in telemetry_sink)
    assert response.json()["players"] == []
