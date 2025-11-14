from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app

_API_KEY = "test-course-key"


def _headers() -> dict[str, str]:
    return {"x-api-key": _API_KEY}


def test_list_courses(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", _API_KEY)
    with TestClient(app) as client:
        resp = client.get("/api/courses", headers=_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert data, "expected at least one course id"


def test_get_course_bundle(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", _API_KEY)
    with TestClient(app) as client:
        ids_resp = client.get("/api/courses", headers=_headers())
        course_ids = ids_resp.json()
        course_id = course_ids[0]

        resp = client.get(f"/api/courses/{course_id}/bundle", headers=_headers())
        assert resp.status_code == 200
        bundle = resp.json()
        assert bundle["id"] == course_id
        assert bundle["name"]
        holes = bundle.get("holes")
        assert isinstance(holes, list)
        assert holes, "expected at least one hole"
        first_hole = holes[0]
        assert "par" in first_hole
        assert "tee_center" in first_hole
        green = first_hole.get("green", {})
        assert "front" in green


def test_get_course_bundle_not_found(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", _API_KEY)
    with TestClient(app) as client:
        resp = client.get("/api/courses/unknown-id/bundle", headers=_headers())
        assert resp.status_code == 404
