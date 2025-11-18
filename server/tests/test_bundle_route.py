import os

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def _headers() -> dict[str, str]:
    api_key = os.getenv("API_KEY")
    return {"x-api-key": api_key} if api_key else {}


def test_bundle_route_returns_payload() -> None:
    response = client.post("/bundle/course/norrmjole_gk", headers=_headers())
    assert response.status_code == 200
    payload = response.json()

    assert payload["id"] == "norrmjole_gk"
    assert payload["name"]
    assert len(payload["holes"]) == 18
    for hole in payload["holes"]:
        assert hole["hole"]
        assert hole["par"]
        assert hole["polyline"]


def test_bundle_route_returns_404_for_unknown_course() -> None:
    response = client.post("/bundle/course/unknown-course", headers=_headers())
    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown course_id"
