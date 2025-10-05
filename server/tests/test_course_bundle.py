from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.courses import DEFAULT_TTL_SECONDS, CourseBundleNotFoundError, load_bundle
from server.courses.schema import (
    Feature,
    PointGeometry,
    PolygonGeometry,
    feature_collection,
)
from server.routes import course_bundle


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
    assert payload["properties"]["course"]["updatedAt"]

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


def test_missing_course_raises() -> None:
    with pytest.raises(CourseBundleNotFoundError):
        load_bundle("does-not-exist")


def test_geometry_and_feature_collection_helpers() -> None:
    pin = Feature(id="pin", geometry=PointGeometry(coordinates=(-122.0, 37.0)))
    green = Feature(
        id="green",
        geometry=PolygonGeometry(
            coordinates=[
                [
                    (-122.0, 37.0),
                    (-122.001, 37.0),
                    (-122.001, 37.001),
                    (-122.0, 37.001),
                    (-122.0, 37.0),
                ]
            ]
        ),
    )
    collection = feature_collection([pin, green], properties={"foo": "bar"})
    assert collection["type"] == "FeatureCollection"
    assert len(collection["features"]) == 2
    assert collection["properties"]["foo"] == "bar"
    point_geojson = collection["features"][0]["geometry"]
    polygon_geojson = collection["features"][1]["geometry"]
    assert point_geojson == {"type": "Point", "coordinates": [-122.0, 37.0]}
    assert polygon_geojson["type"] == "Polygon"
    assert polygon_geojson["coordinates"][0][0] == [-122.0, 37.0]


@pytest.mark.parametrize(
    "header,expected",
    [
        (None, False),
        ("", False),
        ('W/"abc"', True),
        ('"abc"', True),
        ('*, "zzz"', True),
        ('"nope"', False),
    ],
)
def test_if_none_match_matching(header: str | None, expected: bool) -> None:
    assert course_bundle._if_none_match_matches(header, "abc") is expected


def test_apply_cache_headers_normalizes_etag() -> None:
    response = course_bundle._apply_cache_headers(course_bundle.Response(), "abc", 10)
    assert response.headers["ETag"] == '"abc"'
    assert response.headers["Cache-Control"] == "public, max-age=10"


def test_courses_listing() -> None:
    response = client.get("/courses")
    assert response.status_code == 200
    payload = response.json()
    assert "courses" in payload
    course_ids = {course["id"] for course in payload["courses"]}
    assert "pebble-creek" in course_ids
    sample = next(
        course for course in payload["courses"] if course["id"] == "pebble-creek"
    )
    assert sample["etag"]
    assert sample["updatedAt"]


def test_course_holes_listing() -> None:
    response = client.get("/course/pebble-creek/holes")
    assert response.status_code == 200
    payload = response.json()
    assert payload["course"]["id"] == "pebble-creek"
    assert payload["course"]["etag"]
    holes = payload["holes"]
    assert len(holes) == 2
    assert {hole["number"] for hole in holes} == {1, 2}
