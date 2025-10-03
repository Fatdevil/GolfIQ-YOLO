from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.courses import DEFAULT_TTL_SECONDS, load_bundle


client = TestClient(app)


def test_load_sample_bundle() -> None:
    bundle = load_bundle("pebble-creek")
    assert bundle.id == "pebble-creek"
    assert bundle.name == "Pebble Creek (Sample)"
    assert bundle.ttl_seconds == DEFAULT_TTL_SECONDS
    assert bundle.etag
    assert len(bundle.holes) == 2
    assert bundle.holes[0].features


def test_course_bundle_cache_headers_and_304() -> None:
    response = client.get("/course/pebble-creek")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == f"public, max-age={DEFAULT_TTL_SECONDS}"
    etag = response.headers["ETag"]
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert payload["properties"]["course"]["hole_count"] == 2

    second = client.get("/course/pebble-creek", headers={"If-None-Match": etag})
    assert second.status_code == 304
    assert second.headers["ETag"] == etag
    assert second.headers["Cache-Control"] == response.headers["Cache-Control"]


def test_course_hole_feature_collection() -> None:
    response = client.get("/course/pebble-creek/holes/1")
    assert response.status_code == 200
    hole_payload = response.json()
    assert hole_payload["type"] == "FeatureCollection"
    hole_props = hole_payload["properties"]["hole"]
    assert hole_props["number"] == 1
    assert hole_props["feature_count"] >= 5
