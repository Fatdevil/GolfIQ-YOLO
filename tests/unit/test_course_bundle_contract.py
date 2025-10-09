from __future__ import annotations

from fastapi.testclient import TestClient

from server.courses.schema import CourseBundle, Hole
from server.routes import course_bundle
from server_app import app


def _build_bundle(ttl: int) -> CourseBundle:
    return CourseBundle(
        id="oakmont",
        name="Oakmont",
        holes=[Hole(number=1)],
        etag="etag123",
        ttl_seconds=ttl,
        updated_at="2024-01-01T00:00:00Z",
    )


def test_offline_bundle_contract(monkeypatch) -> None:
    bundle = _build_bundle(ttl=900)

    def _fake_load(_: str) -> CourseBundle:
        return bundle

    monkeypatch.setattr(course_bundle, "load_bundle", _fake_load)

    client = TestClient(app)
    response = client.get("/bundle/course/oakmont")
    assert response.status_code == 200
    payload = response.json()

    assert payload["course"] == {
        "id": "oakmont",
        "name": "Oakmont",
        "updatedAt": "2024-01-01T00:00:00Z",
        "ttlSeconds": 900,
        "etag": "etag123",
    }
    assert set(payload["layers"].keys()) == {"fairways", "greens", "bunkers", "hazards"}
    assert payload["metadata"]["holeCount"] == 1


def test_offline_bundle_ttl_fallback(monkeypatch) -> None:
    bundle = _build_bundle(ttl=0)

    def _fake_load(_: str) -> CourseBundle:
        return bundle

    monkeypatch.setattr(course_bundle, "load_bundle", _fake_load)

    client = TestClient(app)
    response = client.get("/bundle/course/oakmont")
    assert response.status_code == 200
    payload = response.json()
    assert payload["course"]["ttlSeconds"] == course_bundle.DEFAULT_TTL_SECONDS
