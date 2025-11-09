import importlib
import time
from typing import List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.telemetry import events as telemetry_events


client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_repo(monkeypatch):
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


def _create_event(monkeypatch) -> str:
    events_module = importlib.import_module("server.routes.events")
    code = events_module.generate_code()
    monkeypatch.setattr(events_module, "generate_code", lambda: code)
    response = client.post("/events", json={"name": "Scoring Test"})
    assert response.status_code == 201
    return response.json()["id"]


def test_register_score_and_board(monkeypatch, telemetry_sink):
    event_id = _create_event(monkeypatch)

    register = client.post(
        f"/events/{event_id}/players",
        json={
            "players": [
                {
                    "scorecardId": "alpha",
                    "name": "Alice",
                    "hcpIndex": 5.2,
                    "playingHandicap": 4,
                },
                {
                    "scorecardId": "bravo",
                    "name": "Bob",
                    "hcpIndex": 8.7,
                    "playingHandicap": 6,
                },
            ]
        },
    )
    assert register.status_code == 200
    body = register.json()
    assert {row["name"] for row in body["players"]} == {"Alice", "Bob"}

    score_a = {
        "scorecardId": "alpha",
        "hole": 1,
        "gross": 4,
        "net": 3,
        "stableford": 2,
        "par": 4,
        "strokesReceived": 1,
        "revision": 1,
        "fingerprint": "alpha-h1",
        "format": "net",
    }
    score_b = {
        "scorecardId": "bravo",
        "hole": 1,
        "gross": 5,
        "net": 4,
        "stableford": 3,
        "par": 4,
        "strokesReceived": 1,
        "revision": 1,
        "fingerprint": "bravo-h1",
        "format": "net",
    }

    first = client.post(f"/events/{event_id}/score", json=score_a)
    assert first.status_code in (200, 201)
    assert first.json()["status"] == "ok"

    second = client.post(f"/events/{event_id}/score", json=score_b)
    assert second.status_code in (200, 201)

    board = client.get(f"/events/{event_id}/board")
    assert board.status_code == 200
    payload = board.json()
    assert payload["grossNet"] == "net"
    assert [row["name"] for row in payload["players"]] == ["Alice", "Bob"]
    assert payload["players"][0]["net"] == pytest.approx(3.0)

    gross_board = client.get(f"/events/{event_id}/board", params={"format": "gross"})
    assert gross_board.status_code == 200
    assert gross_board.json()["grossNet"] == "gross"

    stableford_board = client.get(
        f"/events/{event_id}/board", params={"format": "stableford"}
    )
    assert stableford_board.status_code == 200
    stableford_players = stableford_board.json()["players"]
    assert stableford_board.json()["grossNet"] == "stableford"
    assert [row["name"] for row in stableford_players] == ["Bob", "Alice"]
    assert stableford_players[0]["stableford"] == 3
    assert any(name == "score.write_ms" for name, _ in telemetry_sink)
    assert any(name == "board.build_ms" for name, _ in telemetry_sink)


def test_score_idempotent(monkeypatch, telemetry_sink):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "alpha", "name": "Alice"}]},
    )
    payload = {
        "scorecardId": "alpha",
        "hole": 1,
        "gross": 4,
        "net": 3,
        "par": 4,
        "revision": 2,
        "fingerprint": "alpha-dup",
    }
    first = client.post(f"/events/{event_id}/score", json=payload)
    assert first.status_code in (200, 201)
    assert first.json()["status"] == "ok"
    retry = client.post(f"/events/{event_id}/score", json=payload)
    assert retry.status_code == 200
    body_retry = retry.json()
    assert body_retry["status"] == "ok"
    assert body_retry.get("idempotent") is True
    statuses = [
        p.get("status") for name, p in telemetry_sink if name == "score.write_ms"
    ]
    assert statuses.count("idempotent") >= 1
    assert any(name == "score.idempotent.accepted" for name, _ in telemetry_sink)


def test_score_conflict(monkeypatch, telemetry_sink):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "alpha", "name": "Alice"}]},
    )
    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "par": 4,
            "revision": 2,
        },
    )
    conflict = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "par": 4,
            "revision": 1,
        },
    )
    assert conflict.status_code == 409
    detail = conflict.json()["detail"]
    assert detail["reason"] == "STALE_OR_DUPLICATE"
    assert detail["currentRevision"] == 2
    assert any(name == "conflict.count" for name, _ in telemetry_sink)
    assert any(
        name == "score.conflict.stale_or_duplicate" for name, _ in telemetry_sink
    )


def test_insert_with_none_revision_sets_one(monkeypatch):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "sc1", "name": "Alice"}]},
    )
    response = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc1",
            "hole": 1,
            "gross": 4,
            "fingerprint": "fp_a",
            "revision": None,
        },
    )
    assert response.status_code in (200, 201)
    assert response.json()["revision"] == 1


def test_equal_revision_same_fingerprint_idempotent_ok(monkeypatch):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "sc1", "name": "Alice"}]},
    )
    payload = {
        "scorecardId": "sc1",
        "hole": 1,
        "gross": 4,
        "fingerprint": "fp_same",
        "revision": 1,
    }
    first = client.post(f"/events/{event_id}/score", json=payload)
    assert first.status_code in (200, 201)
    second = client.post(f"/events/{event_id}/score", json=payload)
    assert second.status_code == 200
    assert second.json().get("idempotent") is True


def test_equal_revision_diff_fingerprint_conflict(monkeypatch):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "sc1", "name": "Alice"}]},
    )
    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc1",
            "hole": 1,
            "gross": 4,
            "fingerprint": "fp_one",
            "revision": 1,
        },
    )
    conflict = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc1",
            "hole": 1,
            "gross": 4,
            "fingerprint": "fp_two",
            "revision": 1,
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["reason"] == "STALE_OR_DUPLICATE"


def test_lower_revision_conflict(monkeypatch):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "sc1", "name": "Alice"}]},
    )
    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc1",
            "hole": 1,
            "gross": 4,
            "fingerprint": "fp_hi",
            "revision": 3,
        },
    )
    conflict = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc1",
            "hole": 1,
            "gross": 5,
            "fingerprint": "fp_low",
            "revision": 2,
        },
    )
    assert conflict.status_code == 409


def test_higher_revision_writes(monkeypatch):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={"players": [{"scorecardId": "sc1", "name": "Alice"}]},
    )
    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc1",
            "hole": 1,
            "gross": 4,
            "fingerprint": "fp_start",
            "revision": 2,
        },
    )
    update = client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "sc1",
            "hole": 1,
            "gross": 3,
            "fingerprint": "fp_next",
            "revision": 3,
        },
    )
    assert update.status_code in (200, 201)
    assert update.json()["revision"] == 3


def test_board_tie_break_and_thru(monkeypatch):
    event_id = _create_event(monkeypatch)
    client.post(
        f"/events/{event_id}/players",
        json={
            "players": [
                {"scorecardId": "alpha", "name": "Alice"},
                {"scorecardId": "bravo", "name": "Bob"},
            ]
        },
    )
    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "alpha",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "par": 4,
            "revision": 1,
        },
    )
    time.sleep(0.01)
    client.post(
        f"/events/{event_id}/score",
        json={
            "scorecardId": "bravo",
            "hole": 1,
            "gross": 4,
            "net": 3,
            "par": 4,
            "revision": 1,
        },
    )
    board = client.get(f"/events/{event_id}/board")
    assert board.status_code == 200
    players = board.json()["players"]
    assert players[0]["name"] == "Bob"
    assert players[0]["thru"] == 1
    assert players[0]["hole"] == 2
    assert players[1]["thru"] == 1
    assert players[1]["hole"] == 2
