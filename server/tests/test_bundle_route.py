from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.config import remote as remote_config
from server.routes import bundle as bundle_route


def _make_client() -> TestClient:
    app = FastAPI()
    app.include_router(bundle_route.router)
    return TestClient(app)


def test_bundle_returns_payload_and_headers(tmp_path, monkeypatch):
    monkeypatch.setenv("BUNDLE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BUNDLE_TTL_SECONDS", "123")
    course_id = "alpha"
    features = [{"type": "Feature", "id": 1}]
    Path(tmp_path / f"{course_id}.json").write_text(json.dumps({"features": features}))

    client = _make_client()
    response = client.get(f"/bundle/course/{course_id}")
    assert response.status_code == 200

    payload = response.json()
    assert payload == {
        "courseId": course_id,
        "version": 1,
        "ttlSec": 123,
        "features": features,
    }
    etag = response.headers.get("ETag")
    assert etag is not None and etag.startswith('W/"')
    assert response.headers.get("Cache-Control") == "public, max-age=123"


def test_bundle_etag_stable_across_calls(tmp_path, monkeypatch):
    monkeypatch.setenv("BUNDLE_DATA_DIR", str(tmp_path))
    Path(tmp_path / "beta.json").write_text(json.dumps({"features": []}))

    client = _make_client()
    first = client.get("/bundle/course/beta")
    second = client.get("/bundle/course/beta")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["ETag"] == second.headers["ETag"]


def test_bundle_ttl_uses_remote_config(tmp_path, monkeypatch):
    monkeypatch.delenv("BUNDLE_TTL_SECONDS", raising=False)
    monkeypatch.setenv("BUNDLE_DATA_DIR", str(tmp_path))

    class DummyStore:
        def snapshot(self):
            return ({"bundle": {"enabled": True, "ttlSeconds": 456}}, "etag", "ts")

    monkeypatch.setattr(remote_config, "_store", DummyStore())

    Path(tmp_path / "gamma.json").write_text("{}")

    client = _make_client()
    response = client.get("/bundle/course/gamma")

    assert response.status_code == 200
    assert response.json()["ttlSec"] == 456
