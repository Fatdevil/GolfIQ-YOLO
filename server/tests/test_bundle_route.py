from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from server.app import app
from server.routes import bundle as bundle_module


def _make_client(monkeypatch, tmp_path: Path) -> TestClient:
    monkeypatch.setattr(bundle_module, "COURSE_BUNDLE_DIR", tmp_path)
    return TestClient(app)


def test_bundle_returns_payload_with_headers(monkeypatch, tmp_path):
    monkeypatch.setenv("BUNDLE_ENABLED", "true")
    monkeypatch.setenv("BUNDLE_TTL_SECONDS", "7200")

    data = {"features": {"fairways": [{"id": "fw1", "points": []}]}}
    course_dir = tmp_path
    course_dir.mkdir(parents=True, exist_ok=True)
    (course_dir / "demo.json").write_text(json.dumps(data))

    client = _make_client(monkeypatch, course_dir)
    response = client.get("/bundle/course/demo")

    assert response.status_code == 200
    body = response.json()
    assert body["courseId"] == "demo"
    assert body["ttlSec"] == 7200
    assert body["features"] == data["features"]
    assert response.headers.get("ETag", "").startswith('W/"')
    assert response.headers.get("Cache-Control") == "public, max-age=7200"


def test_etag_is_stable(monkeypatch, tmp_path):
    monkeypatch.setenv("BUNDLE_ENABLED", "1")
    payload = {"features": [1, 2, 3]}
    (tmp_path / "course-a.json").write_text(json.dumps(payload))
    client = _make_client(monkeypatch, tmp_path)

    first = client.get("/bundle/course/course-a")
    second = client.get("/bundle/course/course-a")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["ETag"] == second.headers["ETag"]


def test_ttl_falls_back_to_default(monkeypatch, tmp_path):
    monkeypatch.delenv("BUNDLE_TTL_SECONDS", raising=False)
    monkeypatch.setenv("BUNDLE_ENABLED", "1")
    client = _make_client(monkeypatch, tmp_path)

    response = client.get("/bundle/course/unknown")
    assert response.status_code == 200
    assert response.json()["ttlSec"] == bundle_module.get_bundle_ttl(None)
