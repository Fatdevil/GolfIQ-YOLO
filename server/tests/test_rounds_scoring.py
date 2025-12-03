import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.rounds.service import RoundService, get_round_service


@pytest.fixture
def round_client(tmp_path):
    service = RoundService(base_dir=tmp_path)
    app.dependency_overrides[get_round_service] = lambda: service
    client = TestClient(app)
    yield client, service
    app.dependency_overrides.pop(get_round_service, None)


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def _start_round(client: TestClient) -> str:
    response = client.post("/api/rounds/start", json={}, headers=_headers())
    assert response.status_code == 200
    return response.json()["id"]


def test_update_and_get_scores(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    hole_one = client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"par": 4, "strokes": 5, "putts": 2, "fairwayHit": True, "gir": False},
        headers=_headers(),
    )
    assert hole_one.status_code == 200

    hole_two = client.put(
        f"/api/rounds/{round_id}/scores/2",
        json={"par": 3, "strokes": 3, "putts": 1, "gir": True},
        headers=_headers(),
    )
    assert hole_two.status_code == 200

    fetched = client.get(f"/api/rounds/{round_id}/scores", headers=_headers())
    assert fetched.status_code == 200
    scores = fetched.json()
    assert scores["roundId"] == round_id
    assert scores["holes"]["1"]["strokes"] == 5
    assert scores["holes"]["1"]["fairwayHit"] is True
    assert scores["holes"]["2"]["putts"] == 1


def test_summary_endpoint(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"par": 4, "strokes": 5, "putts": 2, "fairwayHit": True, "gir": True},
        headers=_headers(),
    )
    client.put(
        f"/api/rounds/{round_id}/scores/10",
        json={"par": 5, "strokes": 6, "putts": 2, "penalties": 1, "fairwayHit": False},
        headers=_headers(),
    )

    response = client.get(f"/api/rounds/{round_id}/summary", headers=_headers())
    assert response.status_code == 200
    summary = response.json()

    assert summary["totalStrokes"] == 11
    assert summary["totalPar"] == 9
    assert summary["totalToPar"] == 2
    assert summary["frontStrokes"] == 5
    assert summary["backStrokes"] == 6
    assert summary["totalPutts"] == 4
    assert summary["totalPenalties"] == 1
    assert summary["fairwaysHit"] == 1
    assert summary["fairwaysTotal"] == 2
    assert summary["girCount"] == 1
    assert summary["holesPlayed"] == 2


def test_scores_require_ownership(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    forbidden_get = client.get(
        f"/api/rounds/{round_id}/scores", headers=_headers("other")
    )
    assert forbidden_get.status_code == 403

    forbidden_put = client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"strokes": 4},
        headers=_headers("other"),
    )
    assert forbidden_put.status_code == 403
