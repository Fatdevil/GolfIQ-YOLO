from fastapi.testclient import TestClient

from server.app import app

_API_KEY = "test-course-key"


def _headers() -> dict[str, str]:
    return {"x-api-key": _API_KEY}


def test_list_hero_courses(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", _API_KEY)

    with TestClient(app) as client:
        response = client.get("/api/courses/hero", headers=_headers())

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1

    first = next((course for course in data if course["id"] == "demo-links"), data[0])
    assert first["name"]
    assert first["holes"] >= 1
    assert first["par"] >= first["holes"]
    assert "tees" in first
    assert isinstance(first["lengthsByTee"], dict)
    assert any(first["lengthsByTee"].values())
