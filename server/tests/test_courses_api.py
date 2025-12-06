from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_list_courses_returns_demo_course():
    with TestClient(app) as client:
        response = client.get("/course-layouts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert any(course["id"] == "demo-links-hero" for course in data)
        demo = next(course for course in data if course["id"] == "demo-links-hero")
        assert demo["holeCount"] > 0
        assert demo["location"] is not None
        assert isinstance(demo["location"].get("lat"), (int, float))
        assert isinstance(demo["location"].get("lon"), (int, float))
        assert isinstance(demo.get("totalPar"), int)
        assert demo["totalPar"] > 0


def test_get_course_layout_returns_holes():
    with TestClient(app) as client:
        response = client.get("/course-layouts/demo-links-hero")
        assert response.status_code == 200
        layout = response.json()
        assert layout["id"] == "demo-links-hero"
        assert isinstance(layout.get("holes"), list)
        assert len(layout["holes"]) > 0
        assert all(
            "par" in hole and isinstance(hole["par"], int) for hole in layout["holes"]
        )
        assert all(
            "yardage_m" in hole and isinstance(hole["yardage_m"], int)
            for hole in layout["holes"]
        )


def test_get_course_layout_404_for_unknown():
    with TestClient(app) as client:
        response = client.get("/course-layouts/unknown")
        assert response.status_code == 404
