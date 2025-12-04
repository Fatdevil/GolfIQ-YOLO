from __future__ import annotations

from fastapi.testclient import TestClient

from server.bag.service import get_player_bag_service


def _client():
    from server.app import app

    return TestClient(app)


def test_get_player_bag_initializes_default_bag(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_BAGS_DIR", str(tmp_path / "bags"))
    get_player_bag_service.cache_clear()

    client = _client()
    resp = client.get("/api/player/bag", headers={"x-api-key": "test-user"})
    assert resp.status_code == 200
    data = resp.json()
    clubs = data.get("clubs", [])
    assert clubs, "default bag should be pre-populated"
    assert any(club.get("clubId") == "driver" for club in clubs)
    assert all(club.get("sampleCount") == 0 for club in clubs)


def test_update_clubs_allows_manual_distance_and_label(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_BAGS_DIR", str(tmp_path / "bags"))
    get_player_bag_service.cache_clear()

    client = _client()
    payload = [
        {
            "clubId": "7i",
            "label": "Seven Iron",
            "manualAvgCarryM": 155.0,
            "active": True,
        }
    ]
    resp = client.post(
        "/api/player/bag/clubs",
        headers={"x-api-key": "test-user"},
        json=payload,
    )
    assert resp.status_code == 200
    data = resp.json()
    club = next(c for c in data["clubs"] if c["clubId"] == "7i")
    assert club["label"] == "Seven Iron"
    assert club["manualAvgCarryM"] == 155.0
    assert club["sampleCount"] == 0
