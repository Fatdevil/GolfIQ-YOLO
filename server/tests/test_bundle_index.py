import os

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def _headers() -> dict[str, str]:
    api_key = os.getenv("API_KEY")
    return {"x-api-key": api_key} if api_key else {}


def test_bundle_index_lists_hero_courses() -> None:
    response = client.get("/bundle/index", headers=_headers())
    assert response.status_code == 200
    manifest = response.json()
    assert isinstance(manifest, list)
    assert len(manifest) >= 5

    hero = next(
        (
            course
            for course in manifest
            if course["id"] == "norrmjole_gk"
            and course.get("courseId") == "norrmjole_gk"
        ),
        None,
    )
    assert hero is not None
    assert hero["holes"] == 18


def test_bundle_index_disabled(monkeypatch) -> None:
    monkeypatch.setenv("BUNDLE_ENABLED", "false")
    response = client.get("/bundle/index", headers=_headers())
    assert response.status_code == 404
    assert response.json()["detail"] == "bundle disabled"
