import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.rounds.service import RoundService, get_round_service


@pytest.fixture
def recap_client(tmp_path):
    service = RoundService(base_dir=tmp_path)
    app.dependency_overrides[get_round_service] = lambda: service
    client = TestClient(app)
    yield client, service
    app.dependency_overrides.pop(get_round_service, None)


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def _seed_round(service: RoundService, client: TestClient) -> str:
    start = client.post(
        "/api/rounds/start",
        json={"courseId": "Test Course", "holes": 3},
        headers=_headers(),
    )
    round_id = start.json()["id"]

    client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"par": 4, "strokes": 6, "putts": 3, "fairwayHit": False, "gir": False},
        headers=_headers(),
    )
    client.put(
        f"/api/rounds/{round_id}/scores/2",
        json={"par": 4, "strokes": 5, "putts": 2, "fairwayHit": True, "gir": False},
        headers=_headers(),
    )
    client.put(
        f"/api/rounds/{round_id}/scores/3",
        json={"par": 3, "strokes": 3, "putts": 2, "gir": True},
        headers=_headers(),
    )

    return round_id


def test_round_recap_success(recap_client):
    client, service = recap_client
    round_id = _seed_round(service, client)

    response = client.get(f"/api/rounds/{round_id}/recap", headers=_headers())
    assert response.status_code == 200
    data = response.json()

    assert data["roundId"] == round_id
    assert data["courseName"] == "Test Course"
    assert data["score"] == 14
    assert data["toPar"] == "+3"
    assert data["holesPlayed"] == 3
    assert data["categories"]["driving"]["grade"] == "C"
    assert data["categories"]["approach"]["grade"] == "D"
    assert data["focusHints"][0].startswith("Dial in approach shots")
    assert any("putts per hole" in hint for hint in data["focusHints"])


def test_round_recap_forbidden_and_missing(recap_client):
    client, service = recap_client
    round_id = _seed_round(service, client)

    forbidden = client.get(f"/api/rounds/{round_id}/recap", headers=_headers("other"))
    assert forbidden.status_code == 403

    missing = client.get("/api/rounds/does-not-exist/recap", headers=_headers())
    assert missing.status_code == 404
