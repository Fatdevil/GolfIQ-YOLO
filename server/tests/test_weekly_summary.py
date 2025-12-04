from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.rounds.service import RoundService, get_round_service


@pytest.fixture
def weekly_client(tmp_path):
    service = RoundService(base_dir=tmp_path)
    app.dependency_overrides[get_round_service] = lambda: service
    client = TestClient(app)
    yield client, service
    app.dependency_overrides.pop(get_round_service, None)


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def _seed_round(
    client: TestClient,
    service: RoundService,
    *,
    player: str = "player-1",
    ended_at: datetime | None = None,
) -> str:
    start = client.post(
        "/api/rounds/start",
        json={"courseId": "Test Course", "holes": 3},
        headers=_headers(player),
    )
    round_id = start.json()["id"]

    client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"par": 4, "strokes": 5, "putts": 2, "fairwayHit": True, "gir": False},
        headers=_headers(player),
    )
    client.put(
        f"/api/rounds/{round_id}/scores/2",
        json={"par": 4, "strokes": 4, "putts": 2, "fairwayHit": False, "gir": True},
        headers=_headers(player),
    )
    client.put(
        f"/api/rounds/{round_id}/scores/3",
        json={"par": 3, "strokes": 3, "putts": 2, "gir": True},
        headers=_headers(player),
    )

    client.post(f"/api/rounds/{round_id}/end", headers=_headers(player))

    if ended_at:
        meta_path = service._base_dir / player / round_id / "round.json"  # noqa: SLF001
        data = json.loads(meta_path.read_text())
        data["ended_at"] = ended_at.isoformat()
        meta_path.write_text(json.dumps(data))

    return round_id


def test_weekly_summary_recent_rounds(weekly_client):
    client, service = weekly_client
    now = datetime.now(timezone.utc)
    for days in range(3):
        _seed_round(client, service, ended_at=now - timedelta(days=days))

    response = client.get("/api/player/summary/weekly", headers=_headers())
    assert response.status_code == 200
    data = response.json()

    assert data["period"]["roundCount"] == 3
    assert data["coreStats"]["avgScore"] is not None
    assert data["categories"]["putting"]["grade"]
    assert len(data["focusHints"]) >= 1
    assert data["strokesGained"]["total"] is not None
    assert "driving" in data["strokesGained"]["categories"]


def test_weekly_summary_falls_back_to_recent_rounds(weekly_client):
    client, service = weekly_client
    now = datetime.now(timezone.utc)
    for days in (10, 12):
        _seed_round(client, service, ended_at=now - timedelta(days=days))

    response = client.get("/api/player/summary/weekly", headers=_headers())
    assert response.status_code == 200
    data = response.json()

    assert data["period"]["roundCount"] == 2
    assert data["coreStats"]["bestScore"] is not None
    assert data["headline"]["text"]


def test_weekly_summary_no_rounds(weekly_client):
    client, _ = weekly_client

    response = client.get("/api/player/summary/weekly", headers=_headers())
    assert response.status_code == 200
    data = response.json()

    assert data["period"]["roundCount"] == 0
    assert data["focusHints"] == []
    assert "Play a round" in data["headline"]["text"]
