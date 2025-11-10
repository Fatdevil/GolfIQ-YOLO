from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_events_create_requires_api_key(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "sekret")
    response = client.post("/events", json={"name": "Test", "emoji": "⛳"})
    assert response.status_code in (401, 403)


def test_commentary_requires_admin_header():
    response = client.post("/events/clips/clip123/commentary")
    assert response.status_code in (401, 403, 422)
