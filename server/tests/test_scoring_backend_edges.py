from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.telemetry import events as telemetry_events

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def fresh_repo(monkeypatch: pytest.MonkeyPatch):
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


def _create_event(repo) -> str:
    event = repo.create_event("Edge Event", None, code="EDGE1")
    return event["id"]


def _register_player(event_id: str, scorecard_id: str) -> None:
    response = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": scorecard_id, "name": "Annika"}]},
    )
    assert response.status_code == 200


def test_players_forbidden_and_payload_422(fresh_repo):
    event_id = _create_event(fresh_repo)

    forbidden = client.post(f"/events/{event_id}/start")
    assert forbidden.status_code == 403

    invalid = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "bad", "name": ""}]},
    )
    assert invalid.status_code == 422


def test_score_first_insert_revision_none_sets_one(fresh_repo):
    event_id = _create_event(fresh_repo)
    _register_player(event_id, "sc-first")

    response = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-first",
            "hole": 1,
            "gross": 4,
            "fingerprint": "fp-first",
            "revision": None,
        },
    )
    assert response.status_code in (200, 201)
    assert response.json()["revision"] == 1


def test_none_revision_idempotent_and_conflict(fresh_repo, telemetry_sink):
    event_id = _create_event(fresh_repo)
    _register_player(event_id, "sc-none")

    base = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-none",
            "hole": 7,
            "gross": 4,
            "fingerprint": "fp-original",
            "revision": 1,
        },
    )
    assert base.status_code in (200, 201)

    idem = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-none",
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
            "scorecardId": "sc-none",
            "hole": 7,
            "gross": 5,
            "fingerprint": "fp-different",
            "revision": None,
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["reason"] == "STALE_OR_DUPLICATE"

    events = {name for name, _payload in telemetry_sink}
    assert "score.idempotent.accepted" in events
    assert "score.conflict.stale_or_duplicate" in events


def test_lower_revision_conflict(fresh_repo):
    event_id = _create_event(fresh_repo)
    _register_player(event_id, "sc-low")

    first = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-low",
            "hole": 4,
            "gross": 4,
            "fingerprint": "fp-low-1",
            "revision": 3,
        },
    )
    assert first.status_code in (200, 201)

    second = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-low",
            "hole": 4,
            "gross": 5,
            "fingerprint": "fp-low-2",
            "revision": 2,
        },
    )
    assert second.status_code == 409


def test_forward_revision_updates(fresh_repo):
    event_id = _create_event(fresh_repo)
    _register_player(event_id, "sc-forward")

    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-forward",
            "hole": 5,
            "gross": 5,
            "fingerprint": "fp-forward-1",
            "revision": 2,
        },
    )

    update = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-forward",
            "hole": 5,
            "gross": 4,
            "fingerprint": "fp-forward-2",
            "revision": 3,
        },
    )
    assert update.status_code in (200, 201)
    assert update.json()["revision"] == 3


def test_update_error_emits_and_returns_5xx(monkeypatch, telemetry_sink):
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
                raise RuntimeError("simulated update failure")
            return super().upsert_score(event_id, payload)

    repo = FailingRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)

    event_id = _create_event(repo)
    _register_player(event_id, "sc-error")

    ok = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-error",
            "hole": 8,
            "gross": 4,
            "fingerprint": "fp-ok",
            "revision": 1,
        },
    )
    assert ok.status_code in (200, 201)

    failing = client.post(
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

    events = {name for name, _payload in telemetry_sink}
    assert "conflict.count" in events
    assert "score.conflict.stale_or_duplicate" in events


def test_board_empty_and_unknown_format(fresh_repo):
    event_id = _create_event(fresh_repo)
    fresh_repo._boards[event_id] = []

    empty = client.get(f"/events/{event_id}/board")
    assert empty.status_code == 200
    payload = empty.json()
    assert isinstance(payload.get("players"), list)
    assert payload["players"] == []

    now = datetime.now(timezone.utc).isoformat()
    fresh_repo._boards[event_id] = [
        {
            "name": "Gross Leader",
            "gross": 72,
            "net": 70,
            "stableford": 30,
            "thru": 18,
            "hole": 18,
            "status": "live",
            "last_under_par_at": now,
            "updated_at": now,
        }
    ]

    default_board = client.get(f"/events/{event_id}/board")
    fallback_board = client.get(f"/events/{event_id}/board?format=foo")
    assert default_board.status_code == 200
    assert fallback_board.status_code == 200
    assert fallback_board.json() == default_board.json()


def test_board_tie_break_branch(fresh_repo):
    event_id = _create_event(fresh_repo)
    now_dt = datetime.now(timezone.utc)
    earlier_dt = now_dt - timedelta(hours=1)
    now = now_dt.isoformat()
    earlier_iso = earlier_dt.isoformat()

    fresh_repo._boards[event_id] = [
        {
            "name": "Casey",
            "gross": 72,
            "net": 70,
            "stableford": 30,
            "thru": 18,
            "hole": 18,
            "status": "player",
            "last_under_par_at": now,
            "updated_at": now,
        },
        {
            "name": "Drew",
            "gross": 72,
            "net": 70,
            "stableford": 30,
            "thru": 18,
            "hole": 18,
            "status": "player",
            "last_under_par_at": earlier_iso,
            "updated_at": now,
        },
    ]

    board = client.get(f"/events/{event_id}/board")
    assert board.status_code == 200
    players = [player["name"] for player in board.json()["players"]]
    assert players == ["Drew", "Casey"]


@pytest.mark.parametrize(
    "payload",
    [
        {"scorecardId": "sc-err", "hole": 0, "gross": 4, "fingerprint": "fp-err"},
        {"scorecardId": "sc-err", "hole": 1, "gross": -1, "fingerprint": "fp-err"},
        {"scorecardId": "sc-err", "hole": 1, "fingerprint": "fp-err"},
    ],
)
def test_score_payload_validation_errors(fresh_repo, payload):
    event_id = _create_event(fresh_repo)
    _register_player(event_id, "sc-err")

    response = client.post(f"/events/{event_id}/score", json=payload)
    assert response.status_code in (400, 422)
