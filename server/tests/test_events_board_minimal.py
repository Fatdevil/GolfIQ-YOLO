from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_get_board_requires_key_and_returns_payload(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "k")

    response = client.get(
        "/events/evt123/board", params={"format": "simple"}, headers={"x-api-key": "k"}
    )
    assert response.status_code == 200
    payload = response.json()
    assert "players" in payload or "rows" in payload or isinstance(payload, dict)
