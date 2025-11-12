from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.services import watch_tip_bus


def setup_function() -> None:
    watch_tip_bus.clear()


def teardown_function() -> None:
    watch_tip_bus.clear()


def test_post_same_tip_twice_returns_original_timestamp() -> None:
    member_id = "mem-123"
    payload = {
        "tipId": "tip-1",
        "title": "Approach",
        "body": "Use 7 iron",
        "club": "7i",
        "playsLike_m": 150.0,
        "shotRef": {"hole": 1, "shot": 2},
    }

    with TestClient(app) as client:
        first = client.post(f"/api/watch/{member_id}/tips", json=payload)
        assert first.status_code == 200
        data_one = first.json()["tip"]
        assert data_one["ts"] > 0

        second = client.post(f"/api/watch/{member_id}/tips", json=payload)
        assert second.status_code == 200
        data_two = second.json()["tip"]

    assert data_one == data_two

    stored = watch_tip_bus.list_tips(member_id)
    assert len(stored) == 1
    assert stored[0].ts == data_one["ts"]
