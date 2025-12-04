from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from server.api.routers.rounds import RoundStrokesGainedOut
from server.app import app
from server.rounds.models import (
    HoleScore,
    RoundScores,
    compute_round_category_stats,
    compute_round_summary,
)
from server.rounds.service import RoundService, get_round_service
from server.rounds.strokes_gained import compute_strokes_gained_for_round


def _build_sample_scores(round_id: str = "r1", player_id: str = "p1") -> RoundScores:
    holes: dict[int, HoleScore] = {
        1: HoleScore(
            hole_number=1,
            par=4,
            strokes=4,
            putts=2,
            penalties=0,
            fairwayHit=True,
            gir=True,
        ),
        2: HoleScore(
            hole_number=2,
            par=5,
            strokes=6,
            putts=2,
            penalties=1,
            fairwayHit=True,
            gir=False,
        ),
        3: HoleScore(hole_number=3, par=3, strokes=4, putts=3, penalties=0, gir=False),
    }
    return RoundScores(round_id=round_id, player_id=player_id, holes=holes)


def test_compute_strokes_gained_for_round_basic():
    scores = _build_sample_scores()
    summary = compute_round_summary(scores)
    category_stats = compute_round_category_stats(scores)

    result = compute_strokes_gained_for_round(summary, category_stats)

    driving_value = result["categories"]["driving"]["value"]
    putting_value = result["categories"]["putting"]["value"]

    assert driving_value > 0
    assert putting_value < 0
    assert result["total"] == pytest.approx(
        sum(category["value"] for category in result["categories"].values())
    )


@pytest.fixture
def sg_client(tmp_path):
    service = RoundService(base_dir=tmp_path)
    app.dependency_overrides[get_round_service] = lambda: service
    client = TestClient(app)
    yield client, service
    app.dependency_overrides.pop(get_round_service, None)


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def _seed_round_for_strokes(
    client: TestClient, service: RoundService, player: str = "player-1"
) -> str:
    start = client.post(
        "/api/rounds/start",
        json={
            "courseId": "Test",
            "holes": 3,
            "startedAt": datetime.now(timezone.utc).isoformat(),
        },
        headers=_headers(player),
    )
    round_id = start.json()["id"]

    scores = _build_sample_scores(round_id=round_id, player_id=player)
    for hole_num, hole in scores.holes.items():
        client.put(
            f"/api/rounds/{round_id}/scores/{hole_num}",
            json=hole.model_dump(by_alias=True),
            headers=_headers(player),
        )

    client.post(f"/api/rounds/{round_id}/end", headers=_headers(player))
    return round_id


def test_round_strokes_gained_endpoint_requires_auth_and_ownership(sg_client):
    client, service = sg_client
    round_id = _seed_round_for_strokes(client, service, player="owner")

    response = client.get(
        f"/api/rounds/{round_id}/strokes-gained", headers=_headers("owner")
    )
    assert response.status_code == 200
    payload = RoundStrokesGainedOut.model_validate(response.json())
    assert payload.round_id == round_id

    other_player_response = client.get(
        f"/api/rounds/{round_id}/strokes-gained", headers=_headers("other")
    )
    assert other_player_response.status_code == 403

    missing_auth = client.get(f"/api/rounds/{round_id}/strokes-gained")
    assert missing_auth.status_code in {401, 403}
