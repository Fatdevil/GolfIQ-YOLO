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


def test_host_actions_require_admin(monkeypatch, telemetry_sink):
    events_module = importlib.import_module("server.routes.events")
    valid_code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: valid_code)

    response = client.post("/events", json={"name": "Masters"})
    event_id = response.json()["id"]

    forbidden = client.post(f"/events/{event_id}/start")
    assert forbidden.status_code == 403

    headers = {"x-event-role": "admin"}
    started = client.post(f"/events/{event_id}/start", headers=headers)
    assert started.status_code == 200
    assert started.json()["status"] == "live"

    paused = client.post(f"/events/{event_id}/pause", headers=headers)
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"

    closed = client.post(f"/events/{event_id}/close", headers=headers)
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"

    host_events = [name for name, _payload in telemetry_sink if name == "events.host.action"]
    assert host_events.count("events.host.action") >= 3


def test_regenerate_code_invalidates_previous(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    first_code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: first_code)

    response = client.post("/events", json={"name": "Summer Open"})
    event_id = response.json()["id"]

    # Regenerate with admin header
    headers = {"x-event-role": "admin"}
    regen = client.post(f"/events/{event_id}/code/regenerate", headers=headers)
    assert regen.status_code == 200
    new_code = regen.json()["code"]
    assert new_code != first_code
    assert regen.json()["qrSvg"].startswith("<svg")

    # Old code no longer valid
    old_join = client.post(f"/join/{first_code}", json={})
    assert old_join.status_code == 404

    # New code should work
    new_join = client.post(f"/join/{new_code}", json={})
    assert new_join.status_code == 200
    assert new_join.json()["eventId"] == event_id


def test_update_settings_persists_gross_net(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: code)

    response = client.post("/events", json={"name": "Club Finals"})
    event_id = response.json()["id"]

    headers = {"x-event-role": "admin"}
    patch = client.patch(
        f"/events/{event_id}/settings",
        headers=headers,
        json={"grossNet": "gross", "tvFlags": {"showQrOverlay": True}},
    )
    assert patch.status_code == 200
    assert patch.json()["grossNet"] == "gross"
    assert patch.json()["tvFlags"]["showQrOverlay"] is True

    board = client.get(f"/events/{event_id}/board")
    assert board.status_code == 200
    body = board.json()
    assert body["grossNet"] == "gross"
    assert body["tvFlags"]["showQrOverlay"] is True
