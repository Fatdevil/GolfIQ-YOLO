from __future__ import annotations

import json

from fastapi.testclient import TestClient

from server.app import app
from server.config.bundle_config import reset_bundle_config_cache

client = TestClient(app)


def _reset_env(monkeypatch) -> None:
    for key in [
        "OFFLINE_BUNDLE_TTL_SEC",
        "OFFLINE_BUNDLE_DATA_ROOT",
        "OFFLINE_BUNDLE_FEATURES",
    ]:
        monkeypatch.delenv(key, raising=False)
    reset_bundle_config_cache()


def test_bundle_route_serves_payload_with_overrides(tmp_path, monkeypatch) -> None:
    _reset_env(monkeypatch)
    course_id = "sample-course"
    overrides = {"features": ["aim", "track"], "notes": {"difficulty": "medium"}}
    course_file = tmp_path / f"{course_id}.json"
    course_file.write_text(json.dumps(overrides), encoding="utf-8")

    monkeypatch.setenv("OFFLINE_BUNDLE_DATA_ROOT", str(tmp_path))
    monkeypatch.setenv("OFFLINE_BUNDLE_TTL_SEC", "4321")
    reset_bundle_config_cache()

    response = client.get(f"/bundle/course/{course_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["courseId"] == course_id
    assert payload["features"] == overrides["features"]
    assert payload["notes"] == overrides["notes"]
    assert payload["ttlSec"] == 4321
    assert response.headers["Cache-Control"] == "public, max-age=4321"
    assert response.headers["ETag"].startswith('W/"')


def test_etag_is_stable_for_same_payload(tmp_path, monkeypatch) -> None:
    _reset_env(monkeypatch)
    course_id = "stable"
    monkeypatch.setenv("OFFLINE_BUNDLE_DATA_ROOT", str(tmp_path))
    reset_bundle_config_cache()

    first = client.get(f"/bundle/course/{course_id}")
    second = client.get(f"/bundle/course/{course_id}")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["ETag"] == second.headers["ETag"]


def test_default_features_applied(monkeypatch) -> None:
    _reset_env(monkeypatch)
    monkeypatch.setenv("OFFLINE_BUNDLE_FEATURES", "aim,calibrate,track")
    monkeypatch.setenv("OFFLINE_BUNDLE_TTL_SEC", "120")
    reset_bundle_config_cache()

    response = client.get("/bundle/course/abc")
    assert response.status_code == 200
    payload = response.json()
    assert payload["features"] == ["aim", "calibrate", "track"]
    assert payload["ttlSec"] == 120
    assert response.headers["Cache-Control"] == "public, max-age=120"
