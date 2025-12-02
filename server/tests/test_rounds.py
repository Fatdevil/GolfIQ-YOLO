from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.club_distance import (
    ClubDistanceAggregator,
    ClubDistanceService,
    get_club_distance_service,
)
from server.rounds.service import RoundService, get_round_service


@pytest.fixture
def round_client(tmp_path):
    service = RoundService(base_dir=tmp_path)
    club_service = ClubDistanceService(ClubDistanceAggregator())
    app.dependency_overrides[get_round_service] = lambda: service
    app.dependency_overrides[get_club_distance_service] = lambda: club_service
    client = TestClient(app)
    yield client, club_service
    app.dependency_overrides.pop(get_round_service, None)
    app.dependency_overrides.pop(get_club_distance_service, None)


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def test_start_and_end_round(round_client) -> None:
    client, _ = round_client

    start = client.post(
        "/api/rounds/start",
        json={"courseId": "course-123", "teeName": "Back", "holes": 9},
        headers=_headers(),
    )
    assert start.status_code == 200
    data = start.json()
    assert data["courseId"] == "course-123"
    assert data["holes"] == 9
    assert data["endedAt"] is None

    round_id = data["id"]
    end = client.post(f"/api/rounds/{round_id}/end", headers=_headers())
    assert end.status_code == 200
    ended = end.json()
    assert ended["endedAt"] is not None


def test_append_and_list_shots(round_client) -> None:
    client, _ = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    shot_resp = client.post(
        f"/api/rounds/{round_id}/shots",
        json={
            "holeNumber": 1,
            "club": "7i",
            "startLat": 10.0,
            "startLon": 20.0,
            "endLat": 10.001,
            "endLon": 20.001,
            "note": "Fairway",
        },
        headers=_headers(),
    )
    assert shot_resp.status_code == 200
    shot = shot_resp.json()
    assert shot["roundId"] == round_id
    assert shot["club"] == "7i"

    list_resp = client.get(f"/api/rounds/{round_id}/shots", headers=_headers())
    assert list_resp.status_code == 200
    shots = list_resp.json()
    assert len(shots) == 1
    assert shots[0]["note"] == "Fairway"


def test_shot_ingests_into_club_distance(round_client) -> None:
    client, club_service = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    response = client.post(
        f"/api/rounds/{round_id}/shots",
        json={
            "holeNumber": 1,
            "club": "PW",
            "startLat": 59.0,
            "startLon": 18.0,
            "endLat": 59.0005,
            "endLon": 18.0005,
        },
        headers=_headers(),
    )
    assert response.status_code == 200

    stats = club_service.get_stats_for_club("player-1", "PW")
    assert stats.samples == 1
    assert stats.last_updated <= datetime.now(timezone.utc)
