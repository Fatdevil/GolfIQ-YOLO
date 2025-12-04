import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.services.shortlinks import _reset_state as reset_shortlinks


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


@pytest.fixture
def share_client(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("API_KEY", "player-1")
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    reset_shortlinks()

    from server.app import app
    from server.rounds.service import RoundService, get_round_service

    service = RoundService(base_dir=tmp_path)
    app.dependency_overrides[get_round_service] = lambda: service
    client = TestClient(app, raise_server_exceptions=False)

    yield client, service

    app.dependency_overrides.pop(get_round_service, None)
    reset_shortlinks()


def _seed_round(
    client: TestClient,
    service,
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


def test_round_share_requires_auth(share_client):
    client, service = share_client
    round_id = _seed_round(client, service)

    response = client.post(f"/api/share/round/{round_id}")

    assert response.status_code in {401, 403}


def test_round_share_returns_shortlink(share_client):
    client, service = share_client
    round_id = _seed_round(client, service)

    response = client.post(f"/api/share/round/{round_id}", headers=_headers())

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["sid"]
    assert payload["url"] == f"{client.base_url}/s/{payload['sid']}"

    share = client.get(f"/api/share/{payload['sid']}")
    assert share.status_code == 200
    body = share.json()
    assert body["kind"] == "round_recap"
    assert body["round_id"] == round_id


def test_weekly_share_requires_auth(share_client):
    client, _ = share_client

    response = client.post("/api/share/weekly")

    assert response.status_code in {401, 403}


def test_weekly_share_returns_shortlink(share_client):
    client, service = share_client
    now = datetime.now(timezone.utc)
    _seed_round(client, service, ended_at=now - timedelta(days=1))

    response = client.post("/api/share/weekly", headers=_headers())

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["sid"]
    assert payload["url"] == f"{client.base_url}/s/{payload['sid']}"

    share = client.get(f"/api/share/{payload['sid']}")
    assert share.status_code == 200
    body = share.json()
    assert body["kind"] == "weekly_summary"
    assert body["summary"]["period"]["roundCount"] >= 1
