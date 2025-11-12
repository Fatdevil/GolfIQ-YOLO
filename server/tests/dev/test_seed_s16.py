from __future__ import annotations

from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.api.routers.run_scores import (
    _RECORDED_EVENTS,
    _RECORDED_EVENTS_LOCK,
    _reset_state as reset_recorded_events,
)
from server.services.anchors_store import (
    _reset_state as reset_anchors,
    get_one as get_anchor,
)


@pytest.fixture(autouse=True)
def _clear_state() -> Iterator[None]:
    reset_recorded_events()
    reset_anchors()
    yield
    reset_recorded_events()
    reset_anchors()


def test_seed_s16_returns_404_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEV_SEED_ENABLE", raising=False)

    client = TestClient(app)
    response = client.post("/api/dev/seed/s16")

    assert response.status_code == 404
    assert response.json() == {"detail": "disabled"}


def test_seed_s16_seeds_scores_and_anchors_idempotently(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DEV_SEED_ENABLE", "1")

    client = TestClient(app)

    first = client.post("/api/dev/seed/s16")
    assert first.status_code == 200
    payload = first.json()
    assert payload == {"eventId": "evt-s16-demo", "runs": ["run-alice", "run-bob"]}

    with _RECORDED_EVENTS_LOCK:
        alice = dict(_RECORDED_EVENTS.get("run-alice", {}))
        bob = dict(_RECORDED_EVENTS.get("run-bob", {}))

    assert set(alice.keys()) == {"shot-1-1", "shot-1-2"}
    assert set(bob.keys()) == {"shot-1-1", "shot-1-2"}

    alice_anchor_one = get_anchor("run-alice", 1, 1)
    alice_anchor_two = get_anchor("run-alice", 1, 2)
    bob_anchor_one = get_anchor("run-bob", 1, 1)
    bob_anchor_two = get_anchor("run-bob", 1, 2)

    assert alice_anchor_one is not None
    assert alice_anchor_two is not None
    assert bob_anchor_one is not None
    assert bob_anchor_two is not None

    second = client.post("/api/dev/seed/s16")
    assert second.status_code == 200
    assert second.json() == payload

    with _RECORDED_EVENTS_LOCK:
        assert dict(_RECORDED_EVENTS.get("run-alice", {})) == alice
        assert dict(_RECORDED_EVENTS.get("run-bob", {})) == bob

    assert get_anchor("run-alice", 1, 1) == alice_anchor_one
    assert get_anchor("run-alice", 1, 2) == alice_anchor_two
    assert get_anchor("run-bob", 1, 1) == bob_anchor_one
    assert get_anchor("run-bob", 1, 2) == bob_anchor_two
