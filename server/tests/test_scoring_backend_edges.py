from __future__ import annotations

import importlib
from typing import Dict, List, Tuple

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from server.app import app
from server.telemetry import events as telemetry_events

client = TestClient(app)


@pytest.fixture
def events_repo(monkeypatch: pytest.MonkeyPatch):
    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)
    return repo


@pytest.fixture
def telemetry_sink():
    captured: List[Tuple[str, Dict[str, object]]] = []

    def _emit(name: str, payload: Dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def _create_event(
    monkeypatch: pytest.MonkeyPatch, *, client_override: TestClient | None = None
) -> str:
    events_module = importlib.import_module("server.routes.events")
    generated = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: generated)
    active_client = client_override or client
    response = active_client.post("/events", json={"name": "Edge Event"})
    assert response.status_code == 201
    return response.json()["id"]


def _register_player(
    event_id: str,
    *,
    scorecard_id: str,
    name: str = "Edge",
    client_override: TestClient | None = None,
) -> None:
    payload = {"players": [{"scorecardId": scorecard_id, "name": name}]}
    active_client = client_override or client
    response = active_client.post(f"/events/{event_id}/players", json=payload)
    assert response.status_code == 200


def _events_by_name(
    captured: List[Tuple[str, Dict[str, object]]], name: str
) -> List[Dict[str, object]]:
    return [payload for event_name, payload in captured if event_name == name]


def test_players_admin_gate_and_validation(
    monkeypatch: pytest.MonkeyPatch, events_repo
):
    _ = events_repo
    events_module = importlib.import_module("server.routes.events")
    event_id = _create_event(monkeypatch)

    with pytest.raises(HTTPException) as excinfo:
        events_module.require_admin(role="player", member_id=None)
    assert excinfo.value.status_code == 403

    ok_response = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "edge-1", "name": "Annika"}]},
    )
    assert ok_response.status_code == 200

    invalid = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"name": "", "hcpIndex": "bad"}]},
    )
    assert invalid.status_code == 422


def test_none_revision_idempotent_then_conflict(
    monkeypatch: pytest.MonkeyPatch, events_repo, telemetry_sink
):
    _ = events_repo
    event_id = _create_event(monkeypatch)
    _register_player(event_id, scorecard_id="sc-edge")

    first = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-edge",
            "hole": 7,
            "gross": 4,
            "fingerprint": "fp-original",
            "revision": 1,
        },
    )
    assert first.status_code in (200, 201)

    idem = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-edge",
            "hole": 7,
            "gross": 4,
            "fingerprint": "fp-original",
            "revision": None,
        },
    )
    assert idem.status_code == 200
    assert idem.json().get("idempotent") is True

    conflict = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-edge",
            "hole": 7,
            "gross": 5,
            "fingerprint": "fp-different",
            "revision": None,
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["reason"] == "STALE_OR_DUPLICATE"

    assert _events_by_name(telemetry_sink, "score.idempotent.accepted")
    assert _events_by_name(telemetry_sink, "score.conflict.stale_or_duplicate")


def test_repository_update_error_emits_and_returns_500(
    monkeypatch: pytest.MonkeyPatch, telemetry_sink
):
    events_module = importlib.import_module("server.routes.events")

    class FailingRepository(events_module._MemoryEventsRepository):
        def upsert_score(self, event_id: str, payload: Dict[str, object]):  # type: ignore[override]
            if payload.get("fingerprint") == "fp-fail":
                telemetry_events.record_score_conflict(
                    event_id,
                    revision=payload.get("revision"),
                    fingerprint=payload.get("fingerprint"),
                )
                telemetry_events.record_score_conflict_stale_or_duplicate(
                    event_id,
                    incoming_revision=payload.get("revision"),
                    existing_revision=payload.get("revision"),
                    fingerprint=payload.get("fingerprint"),
                )
                raise RuntimeError("update failure")
            return super().upsert_score(event_id, payload)

    repo = FailingRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)

    error_client = TestClient(app, raise_server_exceptions=False)

    event_id = _create_event(monkeypatch, client_override=error_client)
    _register_player(event_id, scorecard_id="sc-error", client_override=error_client)

    ok = error_client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-error",
            "hole": 8,
            "gross": 4,
            "fingerprint": "fp-base",
            "revision": 1,
        },
    )
    assert ok.status_code in (200, 201)

    failing = error_client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-error",
            "hole": 8,
            "gross": 3,
            "fingerprint": "fp-fail",
            "revision": 2,
        },
    )
    assert failing.status_code >= 500

    names = {name for name, _payload in telemetry_sink}
    assert "conflict.count" in names
    assert "score.conflict.stale_or_duplicate" in names


def test_board_empty_event_returns_no_players(
    monkeypatch: pytest.MonkeyPatch, events_repo
):
    event_id = _create_event(monkeypatch)
    events_repo._boards[event_id] = []

    board = client.get(f"/events/{event_id}/board")
    assert board.status_code == 200
    assert board.json()["players"] == []


def test_board_unknown_format_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch, events_repo
):
    _ = events_repo
    event_id = _create_event(monkeypatch)
    _register_player(event_id, scorecard_id="p-one", name="Alice")
    _register_player(event_id, scorecard_id="p-two", name="Bob")

    for payload in (
        {
            "scorecardId": "p-one",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "fingerprint": "alpha",
            "revision": 1,
        },
        {
            "scorecardId": "p-two",
            "hole": 1,
            "gross": 6,
            "net": 7,
            "fingerprint": "bravo",
            "revision": 1,
        },
    ):
        response = client.post(f"/events/{event_id}/score", json=payload)
        assert response.status_code in (200, 201)

    default_board = client.get(f"/events/{event_id}/board")
    fallback_board = client.get(f"/events/{event_id}/board", params={"format": "foo"})

    assert default_board.status_code == 200
    assert fallback_board.status_code == 200
    assert fallback_board.json()["grossNet"] == default_board.json()["grossNet"]
    assert fallback_board.json()["players"] == default_board.json()["players"]


def test_board_tie_breaker_uses_last_under_par(
    monkeypatch: pytest.MonkeyPatch, events_repo
):
    event_id = _create_event(monkeypatch)
    events_repo._boards[event_id] = [
        {
            "name": "Casey",
            "gross": 72,
            "net": 70,
            "stableford": 30,
            "thru": 18,
            "hole": 1,
            "last_under_par_at": "2024-01-10T10:00:00+00:00",
            "updated_at": "2024-01-10T12:00:00+00:00",
        },
        {
            "name": "Drew",
            "gross": 72,
            "net": 70,
            "stableford": 30,
            "thru": 18,
            "hole": 1,
            "last_under_par_at": "2024-01-10T08:00:00+00:00",
            "updated_at": "2024-01-10T12:00:00+00:00",
        },
    ]

    board = client.get(f"/events/{event_id}/board", params={"format": "gross"})
    assert board.status_code == 200

    players = [player["name"] for player in board.json()["players"]]
    assert players == ["Drew", "Casey"]
