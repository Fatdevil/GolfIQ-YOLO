from fastapi.testclient import TestClient

from server.app import app


def test_protected_requires_api_key(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "k")

    with TestClient(app) as client:
        response = client.get("/protected")

    assert response.status_code in (401, 403)


def test_protected_accepts_valid_key(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "k")

    with TestClient(app) as client:
        response = client.get("/protected", headers={"x-api-key": "k"})

    assert response.status_code == 200
    assert response.json().get("ok") is True
