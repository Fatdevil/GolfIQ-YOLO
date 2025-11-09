from __future__ import annotations

import importlib
from typing import Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.telemetry import events as telemetry_events


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_repository(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)
    yield repo


@pytest.fixture
def telemetry_capture():
    captured: List[Tuple[str, Dict[str, object]]] = []

    def _emit(name: str, payload: Dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def _create_event(monkeypatch) -> str:
    events_module = importlib.import_module("server.routes.events")
    code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: code)
    response = client.post("/events", json={"name": "Coverage Event"})
    assert response.status_code == 201
    return response.json()["id"]


def _register_player(
    event_id: str, *, scorecard_id: str = "sc-1", name: str = "Alice"
) -> None:
    register = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": scorecard_id, "name": name}]},
    )
    assert register.status_code == 200


def _find_event(
    captured: List[Tuple[str, Dict[str, object]]], name: str
) -> List[Dict[str, object]]:
    return [payload for event_name, payload in captured if event_name == name]


def test_register_players_success_and_422(monkeypatch):
    event_id = _create_event(monkeypatch)

    ok_response = client.post(
        f"/events/{event_id}/players",
        json={
            "players": [
                {"scorecardId": "p-1", "name": "Annika", "hcpIndex": 3.4},
                {"scorecardId": "p-2", "name": "Sören"},
            ]
        },
    )
    assert ok_response.status_code == 200
    body = ok_response.json()
    assert {player["scorecardId"] for player in body["players"]} == {"p-1", "p-2"}

    invalid = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "oops"}]},
    )
    assert invalid.status_code == 422


def test_first_insert_revision_none_sets_one(monkeypatch, telemetry_capture):
    event_id = _create_event(monkeypatch)
    _register_player(event_id)

    response = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "stableford": 2,
            "par": 4,
            "fingerprint": "fp-none",
            "revision": None,
        },
    )
    assert response.status_code in (200, 201)
    payload = response.json()
    assert payload["revision"] == 1
    assert payload["status"] == "ok"
    assert _find_event(telemetry_capture, "score.write_ms")


def test_idempotent_same_revision_same_fingerprint(monkeypatch, telemetry_capture):
    event_id = _create_event(monkeypatch)
    _register_player(event_id)

    payload = {
        "scorecardId": "sc-1",
        "hole": 2,
        "gross": 4,
        "net": 3,
        "stableford": 2,
        "par": 4,
        "fingerprint": "fp-idem",
        "revision": 1,
    }
    first = client.post(f"/events/{event_id}/score", json=payload)
    assert first.status_code in (200, 201)
    retry = client.post(f"/events/{event_id}/score", json=payload)
    assert retry.status_code == 200
    body = retry.json()
    assert body.get("idempotent") is True

    assert _find_event(telemetry_capture, "score.idempotent.accepted")
    statuses = [
        p.get("status") for p in _find_event(telemetry_capture, "score.write_ms")
    ]
    assert "idempotent" in statuses


def test_conflict_same_revision_different_fingerprint(monkeypatch, telemetry_capture):
    event_id = _create_event(monkeypatch)
    _register_player(event_id)

    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 3,
            "gross": 4,
            "net": 3,
            "stableford": 2,
            "par": 4,
            "fingerprint": "fp-original",
            "revision": 1,
        },
    )
    conflict = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 3,
            "gross": 5,
            "net": 4,
            "stableford": 1,
            "par": 4,
            "fingerprint": "fp-conflict",
            "revision": 1,
        },
    )
    assert conflict.status_code == 409
    detail = conflict.json()["detail"]
    assert detail["reason"] == "STALE_OR_DUPLICATE"

    assert _find_event(telemetry_capture, "conflict.count")
    assert _find_event(telemetry_capture, "score.conflict.stale_or_duplicate")


def test_conflict_lower_revision(monkeypatch, telemetry_capture):
    event_id = _create_event(monkeypatch)
    _register_player(event_id)

    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 4,
            "gross": 4,
            "fingerprint": "fp-high",
            "revision": 3,
        },
    )
    conflict = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 4,
            "gross": 5,
            "fingerprint": "fp-low",
            "revision": 2,
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["reason"] == "STALE_OR_DUPLICATE"
    assert _find_event(telemetry_capture, "score.conflict.stale_or_duplicate")


def test_higher_revision_writes(monkeypatch, telemetry_capture):
    event_id = _create_event(monkeypatch)
    _register_player(event_id)

    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 5,
            "gross": 5,
            "fingerprint": "fp-start",
            "revision": 2,
        },
    )
    update = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 5,
            "gross": 4,
            "net": 3,
            "stableford": 2,
            "par": 4,
            "fingerprint": "fp-forward",
            "revision": 3,
        },
    )
    assert update.status_code in (200, 201)
    payload = update.json()
    assert payload["revision"] == 3
    assert payload["status"] == "ok"
    assert _find_event(telemetry_capture, "score.write_ms")


def test_score_value_error_records_invalid(monkeypatch, telemetry_capture):
    events_module = importlib.import_module("server.routes.events")

    def _boom(self, event_id: str, payload: Dict[str, object]):
        raise ValueError("db boom")

    monkeypatch.setattr(events_module._MemoryEventsRepository, "upsert_score", _boom)

    event_id = _create_event(monkeypatch)
    _register_player(event_id)

    response = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc-1",
            "hole": 6,
            "gross": 4,
            "fingerprint": "fp-error",
            "revision": 1,
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "db boom"

    statuses = [
        p.get("status") for p in _find_event(telemetry_capture, "score.write_ms")
    ]
    assert "invalid" in statuses


def test_board_gross_net_and_stableford(monkeypatch, telemetry_capture):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={
            "players": [
                {"scorecardId": "alpha", "name": "Alice", "hcpIndex": 5.2},
                {"scorecardId": "bravo", "name": "Bob", "hcpIndex": 8.7},
            ]
        },
    )

    for payload in (
        {
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 5,
            "net": 3,
            "stableford": 2,
            "par": 4,
            "fingerprint": "alpha-h1",
            "revision": 1,
        },
        {
            "scorecardId": "bravo",
            "hole": 1,
            "gross": 4,
            "net": 5,
            "stableford": 1,
            "par": 4,
            "fingerprint": "bravo-h1",
            "revision": 1,
        },
    ):
        post = client.post(f"/events/{event_id}/score", json=payload)
        assert post.status_code in (200, 201)

    default_board = client.get(f"/events/{event_id}/board")
    assert default_board.status_code == 200
    default_payload = default_board.json()
    assert default_payload["grossNet"] == "net"

    net_board = client.get(f"/events/{event_id}/board", params={"format": "net"})
    gross_board = client.get(f"/events/{event_id}/board", params={"format": "gross"})
    stableford_board = client.get(
        f"/events/{event_id}/board", params={"format": "stableford"}
    )

    assert (
        net_board.status_code
        == gross_board.status_code
        == stableford_board.status_code
        == 200
    )

    net_payload = net_board.json()
    gross_payload = gross_board.json()
    stableford_payload = stableford_board.json()

    def _totals(board: Dict[str, object], field: str) -> Dict[str, float]:
        return {row["name"]: row[field] for row in board["players"]}

    net_totals = _totals(net_payload, "net")
    gross_totals = _totals(gross_payload, "gross")
    stableford_totals = _totals(stableford_payload, "stableford")

    assert net_totals["Alice"] != gross_totals["Alice"]
    assert stableford_totals["Alice"] != gross_totals["Alice"]
    assert net_totals["Bob"] != stableford_totals["Bob"]

    assert _find_event(telemetry_capture, "board.build_ms")
