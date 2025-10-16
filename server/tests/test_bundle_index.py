from __future__ import annotations

import json
from pathlib import Path
from typing import Any

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


def test_bundle_index_handles_missing_directory(monkeypatch, tmp_path: Path) -> None:
    missing = tmp_path / "missing"
    monkeypatch.setattr(bundle_index, "COURSES_DIR", missing)
    monkeypatch.setattr(bundle_index, "META_DIR", missing / "meta")

    client = TestClient(app)
    response = client.get("/bundle/index")
    assert response.status_code == 200
    assert response.json() == {"version": 1, "courses": []}


def test_bundle_index_skips_invalid_files(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(bundle_index, "COURSES_DIR", tmp_path)
    monkeypatch.setattr(bundle_index, "META_DIR", tmp_path / "meta")
    bad_path = tmp_path / "invalid.json"
    bad_path.write_text("{", encoding="utf-8")

    client = TestClient(app)
    response = client.get("/bundle/index")
    assert response.status_code == 200
    assert response.json()["courses"] == []


def test_load_json_handles_errors(tmp_path: Path) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text("{", encoding="utf-8")
    assert bundle_index._load_json(bad) is None

    bad.write_text(json.dumps([1, 2, 3]), encoding="utf-8")
    assert bundle_index._load_json(bad) is None


def test_compute_bbox_and_counts_cover_edge_cases() -> None:
    features: list[dict[str, Any]] = [
        {
            "type": "Green",
            "geometry": {"coordinates": [[[1.0, 2.0], [2.0, 3.0], [1.0, 2.0]]]},
        },
        {
            "type": " Fairway ",
            "geometry": {"coordinates": [[[-1.0, -2.0], [0.0, 0.0]]]},
        },
        {"type": "", "geometry": {"coordinates": []}},
        {"type": None},
        {"geometry": {"coordinates": [[1, 1]]}},
    ]
    bbox = bundle_index._compute_bbox_from_features(features)
    assert bbox == [-1.0, -2.0, 2.0, 3.0]

    counts = bundle_index._count_feature_types(features)
    assert counts == {"greens": 1, "fairwaies": 1}


def test_build_course_entry_without_metadata(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(bundle_index, "META_DIR", tmp_path / "meta")
    monkeypatch.setattr(bundle_index, "_isoformat_timestamp", lambda ts: "STAMP")

    course_path = tmp_path / "demo.json"
    payload = {
        "courseId": "demo",
        "features": [
            {
                "type": "green",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]]],
                },
            },
            {
                "type": "cartpath",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[0.0, 0.0], [2.0, 0.0]],
                },
            },
            {"type": "", "geometry": {}},
        ],
    }
    course_path.write_text(json.dumps(payload), encoding="utf-8")

    entry = bundle_index._build_course_entry(course_path)
    assert entry is not None
    assert entry["courseId"] == "demo"
    assert entry["bbox"] == [0.0, 0.0, 2.0, 1.0]
    assert entry["updatedAt"] == "STAMP"
    assert entry["approx"] == {"greens": 1, "cartpaths": 1}
    assert "name" not in entry


def test_load_metadata_missing(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(bundle_index, "META_DIR", tmp_path)
    assert bundle_index._load_metadata("missing") is None
