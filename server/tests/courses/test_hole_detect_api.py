from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app

client = TestClient(app)


def test_auto_hole_returns_suggestion() -> None:
    response = client.post(
        "/api/auto-hole",
        json={
            "courseId": "demo-links",
            "lat": 37.4318,
            "lon": -122.1610,
            "currentHole": 1,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["courseId"] == "demo-links"
    assert payload["suggestedHole"] is not None
    assert 1 <= payload["suggestedHole"] <= 18
    assert payload["confidence"] is not None


def test_auto_hole_returns_404_for_unknown_course() -> None:
    response = client.post(
        "/api/auto-hole",
        json={
            "courseId": "missing-course",
            "lat": 0.0,
            "lon": 0.0,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "course_not_found"
