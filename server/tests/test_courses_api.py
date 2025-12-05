from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_list_courses_returns_demo_course():
    with TestClient(app) as client:
        response = client.get("/courses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert any(course["id"] == "demo-links-hero" for course in data)
        demo = next(course for course in data if course["id"] == "demo-links-hero")
        assert demo["holeCount"] > 0


def test_get_course_layout_returns_holes():
    with TestClient(app) as client:
        response = client.get("/courses/demo-links-hero/layout")
        assert response.status_code == 200
        layout = response.json()
        assert layout["id"] == "demo-links-hero"
        assert isinstance(layout.get("holes"), list)
        assert len(layout["holes"]) > 0


def test_get_course_layout_404_for_unknown():
    with TestClient(app) as client:
        response = client.get("/courses/unknown/layout")
        assert response.status_code == 404
