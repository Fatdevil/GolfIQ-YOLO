import importlib
from typing import Any, Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_repo(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)
    yield


@pytest.fixture
def telemetry_spy(monkeypatch) -> List[Tuple[str, Dict[str, Any]]]:
    events_module = importlib.import_module("server.routes.events")
    calls: List[Tuple[str, Dict[str, Any]]] = []

    def capture(event_name: str, payload: Dict[str, Any]):
        calls.append((event_name, dict(payload)))

    def _wrap(event_name):
        def _recorder(event_id: str, **kwargs):
            payload = {"eventId": event_id, **kwargs}
            capture(event_name, payload)

        return _recorder

    monkeypatch.setattr(
        events_module,
        "record_score_write",
        lambda event_id, duration_ms, *, status, fingerprint=None, revision=None: capture(
            "score.write_ms",
            {
                "eventId": event_id,
                "durationMs": duration_ms,
                "status": status,
                "fingerprint": fingerprint,
                "revision": revision,
            },
        ),
    )
    monkeypatch.setattr(
        events_module,
        "record_score_idempotent",
        _wrap("score.idempotent.accepted"),
    )
    monkeypatch.setattr(
        events_module,
        "record_score_conflict",
        _wrap("conflict.count"),
    )
    monkeypatch.setattr(
        events_module,
        "record_score_conflict_stale_or_duplicate",
        _wrap("score.conflict.stale_or_duplicate"),
    )
    monkeypatch.setattr(
        events_module,
        "record_board_build",
        lambda event_id, duration_ms, *, mode=None, rows=None: capture(
            "board.build_ms",
            {
                "eventId": event_id,
                "durationMs": duration_ms,
                "mode": mode,
                "rows": rows,
            },
        ),
    )
    return calls


def _create_event(monkeypatch) -> str:
    events_module = importlib.import_module("server.routes.events")
    code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: code)
    response = client.post("/events", json={"name": "Coverage Event"})
    assert response.status_code == 201
    return response.json()["id"]


def test_register_players_happy_path_and_invalid(monkeypatch):
    event_id = _create_event(monkeypatch)

    ok_response = client.post(
        f"/events/{event_id}/players",
        json={
            "players": [
                {
                    "scorecardId": "sc-1",
                    "name": "Alice",
                    "hcpIndex": 4.2,
                    "playingHandicap": 3,
                },
                {"scorecardId": "sc-2", "name": "Bob"},
            ]
        },
    )
    assert ok_response.status_code == 200
    body = ok_response.json()
    assert {player["scorecardId"] for player in body["players"]} == {"sc-1", "sc-2"}

    invalid = client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "oops"}]},
    )
    assert invalid.status_code == 422


def test_score_revision_paths_and_telemetry(monkeypatch, telemetry_spy):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "alpha", "name": "Alice"}]},
    )

    first = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "stableford": 2,
            "par": 4,
            "strokesReceived": 1,
            "fingerprint": "fp-1",
            "revision": None,
        },
    )
    assert first.status_code in (200, 201)
    payload = first.json()
    assert payload["revision"] == 1

    idempotent = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "stableford": 2,
            "par": 4,
            "strokesReceived": 1,
            "fingerprint": "fp-1",
            "revision": 1,
        },
    )
    assert idempotent.status_code == 200
    assert idempotent.json().get("idempotent") is True

    conflict_same_revision = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 5,
            "net": 4,
            "stableford": 1,
            "par": 4,
            "strokesReceived": 0,
            "fingerprint": "fp-2",
            "revision": 1,
        },
    )
    assert conflict_same_revision.status_code == 409
    assert conflict_same_revision.json()["detail"]["reason"] == "STALE_OR_DUPLICATE"

    higher_revision = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 3,
            "net": 2,
            "stableford": 3,
            "par": 4,
            "strokesReceived": 1,
            "fingerprint": "fp-3",
            "revision": 2,
        },
    )
    assert higher_revision.status_code in (200, 201)
    assert higher_revision.json()["revision"] == 2

    lower_revision = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 2,
            "net": 1,
            "stableford": 4,
            "par": 3,
            "strokesReceived": 1,
            "fingerprint": "fp-4",
            "revision": 1,
        },
    )
    assert lower_revision.status_code == 409
    assert lower_revision.json()["detail"]["reason"] == "STALE_OR_DUPLICATE"

    assert any(name == "score.idempotent.accepted" for name, _ in telemetry_spy)
    assert any(name == "score.conflict.stale_or_duplicate" for name, _ in telemetry_spy)
    assert any(name == "score.write_ms" for name, _ in telemetry_spy)


def test_board_formats_and_totals(monkeypatch, telemetry_spy):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={
            "players": [
                {"scorecardId": "alpha", "name": "Alice", "hcpIndex": 5.0},
                {"scorecardId": "bravo", "name": "Bob", "hcpIndex": 3.2},
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
            "strokesReceived": 1,
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
            "strokesReceived": 0,
            "fingerprint": "bravo-h1",
            "revision": 1,
        },
    ):
        resp = client.post(f"/events/{event_id}/score", json=payload)
        assert resp.status_code in (200, 201)

    default_board = client.get(f"/events/{event_id}/board")
    assert default_board.status_code == 200
    default_payload = default_board.json()
    assert default_payload["grossNet"] == "net"

    net_board = client.get(f"/events/{event_id}/board", params={"format": "net"})
    assert net_board.status_code == 200
    net_payload = net_board.json()
    assert net_payload["grossNet"] == "net"

    gross_board = client.get(f"/events/{event_id}/board", params={"format": "gross"})
    assert gross_board.status_code == 200
    gross_payload = gross_board.json()
    assert gross_payload["grossNet"] == "gross"

    stableford_board = client.get(
        f"/events/{event_id}/board", params={"format": "stableford"}
    )
    assert stableford_board.status_code == 200
    stableford_payload = stableford_board.json()
    assert stableford_payload["grossNet"] == "stableford"

    net_totals = {row["name"]: row["net"] for row in net_payload["players"]}
    gross_totals = {row["name"]: row["gross"] for row in gross_payload["players"]}
    stableford_totals = {
        row["name"]: row["stableford"] for row in stableford_payload["players"]
    }

    assert net_totals["Alice"] != gross_totals["Alice"]
    assert stableford_totals["Alice"] != gross_totals["Alice"]
    assert net_totals["Bob"] != stableford_totals["Bob"]

    assert any(name == "board.build_ms" for name, _ in telemetry_spy)
