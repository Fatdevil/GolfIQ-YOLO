from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.bundles.models import CourseBundle, CourseHole
from server.routes import hole_detect

client = TestClient(app, raise_server_exceptions=True)


def _hero_bundle() -> CourseBundle:
    return CourseBundle(
        id="hero-1",
        name="Hero Course",
        holes=[
            CourseHole(
                hole=1, par=4, polyline=[(37.0, -122.0)], green_center=(37.0001, -122.0)
            ),
            CourseHole(
                hole=2,
                par=3,
                polyline=[(37.001, -122.0)],
                green_center=(37.001, -122.0),
            ),
        ],
    )


def test_hole_detect_endpoint_success(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _hero_bundle()
    monkeypatch.setattr(hole_detect, "get_bundle", lambda course_id: bundle)

    response = client.post(
        "/api/hole/detect",
        json={"courseId": bundle.id, "lat": 37.0001, "lon": -122.0, "lastHole": 1},
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["hole"] == 1
    assert body["reason"] in {"nearest_green", "nearest_next_hole"}
    assert body["distance_m"] >= 0
    assert 0 <= body["confidence"] <= 1


def test_hole_detect_endpoint_unknown_course(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hole_detect, "get_bundle", lambda course_id: None)

    response = client.post(
        "/api/hole/detect",
        json={"courseId": "missing", "lat": 0.0, "lon": 0.0},
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 404


def test_hole_detect_endpoint_no_suggestion(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _hero_bundle()
    monkeypatch.setattr(hole_detect, "get_bundle", lambda course_id: bundle)

    response = client.post(
        "/api/hole/detect",
        json={"courseId": bundle.id, "lat": 39.0, "lon": -120.0},
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 404
