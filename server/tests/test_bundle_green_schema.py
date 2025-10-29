from __future__ import annotations

from scripts.validate_course_bundle import validate_bundle


def _base_payload() -> dict[str, object]:
    return {
        "courseId": "schema-demo",
        "version": 1,
        "ttlSec": 3600,
        "features": [
            {
                "id": "g1",
                "type": "green",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-122.0, 37.0],
                            [-122.0005, 37.0],
                            [-122.0005, 37.0005],
                            [-122.0, 37.0005],
                            [-122.0, 37.0],
                        ]
                    ],
                },
            }
        ],
    }


def test_green_metadata_allows_optional_sections_fat_side_and_pin() -> None:
    payload = _base_payload()
    payload["features"][0]["green"] = {
        "sections": ["front", "middle", "back"],
        "fatSide": "L",
        "pin": {"lat": 37.0002, "lon": -122.0003, "ts": "2025-03-01T10:30:00Z"},
    }
    errors = validate_bundle(payload)
    assert errors == []


def test_green_metadata_rejects_invalid_pin_fields() -> None:
    payload = _base_payload()
    payload["features"][0]["green"] = {
        "fatSide": "R",
        "pin": {"lat": 123, "lon": "west", "ts": "not-a-date"},
    }
    errors = validate_bundle(payload)
    assert any("green.pin.lat" in message for message in errors)
    assert any("green.pin.lon" in message for message in errors)
    assert any("green.pin.ts" in message for message in errors)
