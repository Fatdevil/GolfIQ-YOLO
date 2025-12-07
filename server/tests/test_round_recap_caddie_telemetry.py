import pytest
from fastapi.testclient import TestClient

from server.api.main import app
from server.rounds.service import RoundService, get_round_service


@pytest.fixture
def round_client(tmp_path):
    service = RoundService(base_dir=tmp_path)
    app.dependency_overrides[get_round_service] = lambda: service
    client = TestClient(app)
    yield client
    app.dependency_overrides.pop(get_round_service, None)


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def test_round_recap_includes_caddie_summary(round_client: TestClient):
    client = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers())
    assert start.status_code == 200
    round_id = start.json()["id"]

    decisions = {
        1: {
            "par": 4,
            "strokes": 4,
            "caddieDecision": {
                "strategy": "attack",
                "targetType": "green",
                "recommendedClubId": "7i",
                "targetDistanceM": 150,
                "followed": True,
                "resultingScore": 4,
            },
        },
        2: {
            "par": 5,
            "strokes": 6,
            "caddieDecision": {
                "strategy": "layup",
                "targetType": "layup",
                "recommendedClubId": "5i",
                "targetDistanceM": 200,
                "followed": False,
                "resultingScore": 6,
            },
        },
        3: {
            "par": 3,
            "strokes": 3,
            "caddieDecision": {
                "strategy": "attack",
                "targetType": "green",
                "recommendedClubId": "8i",
                "targetDistanceM": 145,
                "followed": True,
                "resultingScore": 3,
            },
        },
    }

    for hole, payload in decisions.items():
        response = client.put(
            f"/api/rounds/{round_id}/scores/{hole}",
            json=payload,
            headers=_headers(),
        )
        assert response.status_code == 200

    recap = client.get(f"/api/rounds/{round_id}/recap", headers=_headers())
    assert recap.status_code == 200

    summary = recap.json().get("caddieSummary")
    assert summary is not None
    assert summary["totalDecisions"] == 3
    assert summary["followedDecisions"] == 2
    assert summary["followRate"] == pytest.approx(2 / 3, rel=1e-3)
    assert summary["notes"]
