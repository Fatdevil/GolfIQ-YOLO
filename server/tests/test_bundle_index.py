from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from server.app import app
from server.routes import bundle_index


def _write_bundle(root: Path, course_id: str, features: list[dict]) -> None:
    payload = {
        "courseId": course_id,
        "version": 1,
        "ttlSec": 3600,
        "features": features,
    }
    (root / f"{course_id}.json").write_text(json.dumps(payload), encoding="utf-8")


def _write_meta(meta_root: Path, course_id: str) -> None:
    meta_root.mkdir(parents=True, exist_ok=True)
    metadata = {
        "courseId": course_id,
        "name": course_id.replace("_", " ").title(),
        "bbox": [-1.0, -1.0, 1.0, 1.0],
        "updatedAt": "2025-02-01T00:00:00Z",
        "approx": {"greens": 1},
    }
    (meta_root / f"{course_id}.json").write_text(json.dumps(metadata), encoding="utf-8")


def test_bundle_index_lists_courses(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(bundle_index, "COURSES_DIR", tmp_path)
    monkeypatch.setattr(bundle_index, "META_DIR", tmp_path / "meta")
    features = [
        {
            "id": "g1",
            "type": "green",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0.0, 0.0], [0.001, 0.0], [0.001, 0.001], [0.0, 0.0]]],
            },
        }
    ]
    _write_bundle(tmp_path, "demo_sunrise", features)
    _write_bundle(tmp_path, "demo_lakeside", features)
    _write_meta(tmp_path / "meta", "demo_sunrise")
    _write_meta(tmp_path / "meta", "demo_lakeside")

    client = TestClient(app)
    response = client.get("/bundle/index")
    assert response.status_code == 200
    body = response.json()
    assert body["version"] == 1
    ids = {course["courseId"] for course in body["courses"]}
    assert ids == {"demo_sunrise", "demo_lakeside"}
    for course in body["courses"]:
        assert "approx" in course
        assert course["bbox"] == [-1.0, -1.0, 1.0, 1.0]
    assert response.headers["Cache-Control"] == "public, max-age=600"


def test_bundle_index_etag_stable(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(bundle_index, "COURSES_DIR", tmp_path)
    monkeypatch.setattr(bundle_index, "META_DIR", tmp_path / "meta")
    features = [
        {
            "id": "g1",
            "type": "green",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[0.0, 0.0], [0.001, 0.0], [0.001, 0.001], [0.0, 0.0]]],
            },
        }
    ]
    _write_bundle(tmp_path, "demo_sunrise", features)
    _write_meta(tmp_path / "meta", "demo_sunrise")

    client = TestClient(app)
    first = client.get("/bundle/index")
    second = client.get("/bundle/index")
    assert first.headers["ETag"] == second.headers["ETag"]
