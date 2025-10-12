from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.config import bundle_config
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


def test_bundle_rejects_invalid_identifier():
    with pytest.raises(bundle_route.HTTPException) as excinfo:
        bundle_route._sanitize_course_id("../etc/passwd")

    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "invalid course id"


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


def test_bundle_disabled(monkeypatch):
    monkeypatch.setenv("BUNDLE_ENABLED", "false")
    client = _make_client()

    response = client.get("/bundle/course/any")

    assert response.status_code == 404
    assert response.json()["detail"] == "bundle disabled"


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"features": [{"id": 1}]}, [{"id": 1}]),
        (
            {"fairways": [1], "hazards": [2]},
            [
                {"type": "fairways", "features": [1]},
                {"type": "hazards", "features": [2]},
            ],
        ),
        ([], []),
        ({"features": "oops"}, []),
    ],
)
def test_feature_loading_variants(payload, expected, tmp_path, monkeypatch):
    monkeypatch.setenv("BUNDLE_DATA_DIR", str(tmp_path))
    course_id = "variant"
    Path(tmp_path / f"{course_id}.json").write_text(json.dumps(payload))

    client = _make_client()
    response = client.get(f"/bundle/course/{course_id}")

    assert response.status_code == 200
    assert response.json()["features"] == expected


def test_invalid_json_returns_empty_features(tmp_path, monkeypatch):
    monkeypatch.setenv("BUNDLE_DATA_DIR", str(tmp_path))
    Path(tmp_path / "broken.json").write_text("{not json}")

    client = _make_client()
    response = client.get("/bundle/course/broken")

    assert response.status_code == 200
    assert response.json()["features"] == []


def test_missing_file_returns_empty_features(tmp_path, monkeypatch):
    monkeypatch.setenv("BUNDLE_DATA_DIR", str(tmp_path))
    client = _make_client()

    response = client.get("/bundle/course/missing")

    assert response.status_code == 200
    assert response.json()["features"] == []


def test_ttl_floor_at_zero(monkeypatch):
    monkeypatch.setenv("BUNDLE_TTL_SECONDS", "-1")
    monkeypatch.setattr(bundle_config, "get_bundle_ttl", lambda: -10)

    client = _make_client()
    response = client.get("/bundle/course/foo")

    assert response.status_code == 200
    assert response.json()["ttlSec"] == 0
