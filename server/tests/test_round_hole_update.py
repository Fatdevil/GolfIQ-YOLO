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


def test_caddie_decision_persists_in_scores(round_client: TestClient):
    client = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers())
    assert start.status_code == 200
    round_id = start.json()["id"]

    payload = {
        "par": 4,
        "strokes": 4,
        "caddieDecision": {
            "strategy": "attack",
            "targetType": "green",
            "recommendedClubId": "7i",
            "targetDistanceM": 152.5,
            "followed": True,
            "resultingScore": 4,
            "notes": "Trusted the caddie",
        },
    }

    update_response = client.put(
        f"/api/rounds/{round_id}/scores/1", json=payload, headers=_headers()
    )
    assert update_response.status_code == 200

    fetched = client.get(f"/api/rounds/{round_id}/scores", headers=_headers())
    assert fetched.status_code == 200
    hole = fetched.json()["holes"]["1"]

    assert hole["caddieDecision"]["strategy"] == "attack"
    assert hole["caddieDecision"]["followed"] is True
    assert hole["caddieDecision"]["recommendedClubId"] == "7i"
    assert hole["caddieDecision"]["targetDistanceM"] == pytest.approx(152.5)
