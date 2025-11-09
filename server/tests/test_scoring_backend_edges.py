from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from server.app import app
from server.telemetry import events as telemetry_events

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture()
def fresh_repository(monkeypatch: pytest.MonkeyPatch):
    """Reset the in-memory events repository before every test."""

    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)
    return repo


@pytest.fixture()
def telemetry_sink():
    captured: List[Tuple[str, Dict[str, object]]] = []

    def _emit(name: str, payload: Dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def _create_event(repo, name: str = "Edge Event", code: str = "EDGE01") -> str:
    event = repo.create_event(name, None, code=code)
    return event["id"]


def _register_player(event_id: str, scorecard_id: str, name: str = "Annika") -> None:
    response = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": scorecard_id, "name": name}]},
    )
    assert response.status_code == 200, response.text


def test_players_forbidden_and_payload_422(fresh_repository):
    events_module = importlib.import_module("server.routes.events")

    with pytest.raises(HTTPException) as excinfo:
        events_module.require_admin(role="spectator", member_id=None)
    assert excinfo.value.status_code == 403

    event_id = _create_event(fresh_repository, code="PLYR22")
    invalid = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "bad", "name": ""}]},
    )
    assert invalid.status_code == 422


def test_none_revision_idempotent_and_conflict(fresh_repository, telemetry_sink):
    event_id = _create_event(fresh_repository, code="NONE00")
    _register_player(event_id, "sc-none")

    first = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-none",
            "hole": 7,
            "gross": 4,
            "fingerprint": "fp-original",
            "revision": 1,
        },
    )
    assert first.status_code in (200, 201)

    idempotent = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-none",
            "hole": 7,
            "gross": 4,
            "fingerprint": "fp-original",
            "revision": None,
        },
    )
    assert idempotent.status_code == 200
    assert idempotent.json().get("idempotent") is True

    conflict = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-none",
            "hole": 7,
            "gross": 5,
            "fingerprint": "fp-diff",
            "revision": None,
        },
    )
    assert conflict.status_code == 409
    detail = conflict.json()["detail"]
    assert detail["reason"] == "STALE_OR_DUPLICATE"

    events = {name for name, _payload in telemetry_sink}
    assert "score.idempotent.accepted" in events
    assert "score.conflict.stale_or_duplicate" in events
    assert "conflict.count" in events


def test_update_error_emits_and_returns_5xx(monkeypatch, telemetry_sink):
    events_module = importlib.import_module("server.routes.events")

    class FailingRepository(events_module._MemoryEventsRepository):
        def upsert_score(self, event_id: str, payload):  # type: ignore[override]
            if payload.get("fingerprint") == "fp-trigger":
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
                raise RuntimeError("update failed")
            return super().upsert_score(event_id, payload)

    repo = FailingRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)

    event_id = _create_event(repo, code="FAIL00")
    _register_player(event_id, "sc-fail")

    seed = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-fail",
            "hole": 8,
            "gross": 5,
            "fingerprint": "fp-seed",
            "revision": 1,
        },
    )
    assert seed.status_code in (200, 201)

    failing = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-fail",
            "hole": 8,
            "gross": 4,
            "fingerprint": "fp-trigger",
            "revision": 2,
        },
    )
    assert failing.status_code >= 500

    events = {name for name, _payload in telemetry_sink}
    assert "conflict.count" in events
    assert "score.conflict.stale_or_duplicate" in events


def test_board_empty_and_unknown_format(fresh_repository):
    empty_event = _create_event(fresh_repository, code="EMPTY0")
    fresh_repository._boards[empty_event] = []  # force cold board path

    empty = client.get(f"/events/{empty_event}/board")
    assert empty.status_code == 200
    assert empty.json()["players"] == []

    format_event = _create_event(fresh_repository, name="Format Event", code="FMT000")
    now = datetime.now(timezone.utc)
    fresh_repository._boards[format_event] = [
        {
            "name": "Gross Leader",
            "gross": 70,
            "net": 68.0,
            "stableford": 30.0,
            "thru": 18,
            "hole": 18,
            "status": "live",
            "updated_at": now.isoformat(),
        },
        {
            "name": "Challenger",
            "gross": 72,
            "net": 70.0,
            "stableford": 28.0,
            "thru": 18,
            "hole": 18,
            "status": "live",
            "updated_at": now.isoformat(),
        },
    ]

    default_board = client.get(f"/events/{format_event}/board")
    gross = client.get(f"/events/{format_event}/board?format=gross")
    fallback = client.get(f"/events/{format_event}/board?format=nonsense")
    assert default_board.status_code == gross.status_code == fallback.status_code == 200
    assert fallback.json() == default_board.json()
    assert gross.json()["grossNet"] == "gross"
    assert default_board.json()["grossNet"] != gross.json()["grossNet"]


def test_board_tie_break_branch(fresh_repository):
    tie_event = _create_event(fresh_repository, name="Tie Event", code="TIE000")
    base_time = datetime.now(timezone.utc)
    fresh_repository._boards[tie_event] = [
        {
            "name": "Player A",
            "gross": 70,
            "net": 68.0,
            "stableford": 32.0,
            "thru": 18,
            "hole": 18,
            "status": "live",
            "updated_at": base_time.isoformat(),
            "last_under_par_at": (base_time - timedelta(minutes=5)).isoformat(),
        },
        {
            "name": "Player B",
            "gross": 70,
            "net": 68.0,
            "stableford": 32.0,
            "thru": 18,
            "hole": 18,
            "status": "live",
            "updated_at": base_time.isoformat(),
            "last_under_par_at": (base_time - timedelta(minutes=2)).isoformat(),
        },
    ]

    board = client.get(f"/events/{tie_event}/board")
    assert board.status_code == 200
    payload = board.json()
    names = [player["name"] for player in payload["players"]]
    assert names == ["Player A", "Player B"]


@pytest.mark.parametrize(
    "bad_payload",
    [
        {
            "scorecardId": "sc-0",
            "hole": 0,
            "strokes": 4,
            "fingerprint": "bad0",
            "revision": 1,
        },
        {"scorecardId": "sc-1", "hole": 1, "fingerprint": "bad1", "revision": 1},
        {
            "scorecardId": "sc-2",
            "hole": 1,
            "strokes": -1,
            "fingerprint": "bad2",
            "revision": 1,
        },
    ],
)
def test_score_payload_422(fresh_repository, bad_payload):
    event_id = _create_event(fresh_repository, code="BAD000")
    response = client.post(f"/events/{event_id}/score", json=bad_payload)
    assert response.status_code in (400, 422)
