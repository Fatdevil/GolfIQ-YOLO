import os

from fastapi.testclient import TestClient

from server.app import app
from server.config.bundle_config import DEFAULT_BUNDLE_TTL_SECONDS


client = TestClient(app)


def _headers() -> dict[str, str]:
    api_key = os.getenv("API_KEY")
    return {"x-api-key": api_key} if api_key else {}


def test_bundle_route_returns_payload() -> None:
    response = client.post("/bundle/course/norrmjole_gk", headers=_headers())
    assert response.status_code == 200
    payload = response.json()

    assert payload["courseId"] == "norrmjole_gk"
    assert payload["version"] == 1
    assert payload["ttlSec"] == DEFAULT_BUNDLE_TTL_SECONDS
    assert payload["name"]
    assert len(payload["features"]) == 18
    for feature in payload["features"]:
        assert feature["id"]
        assert feature["geometry"]["coordinates"]
        assert feature["properties"]["par"]


def test_bundle_route_returns_404_for_unknown_course() -> None:
    response = client.post("/bundle/course/unknown-course", headers=_headers())
    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown course_id"
