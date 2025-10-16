from __future__ import annotations

import json
from pathlib import Path

from scripts import validate_course_bundle as validator


def test_validate_accepts_valid_bundle(tmp_path: Path) -> None:
    bundle = {
        "courseId": "demo",
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
                            [0.0, 0.0],
                            [0.001, 0.0],
                            [0.001, 0.001],
                            [0.0, 0.0],
                        ]
                    ],
                },
            },
            {
                "id": "c1",
                "type": "cartpath",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[0.0, 0.0], [0.001, 0.001]],
                },
            },
        ],
    }
    bundle_path = tmp_path / "demo.json"
    bundle_path.write_text(json.dumps(bundle), encoding="utf-8")
    errors = validator.validate_file(bundle_path, max_bytes=4096)
    assert errors == []


def test_validate_flags_invalid_bundle(tmp_path: Path) -> None:
    invalid = {
        "courseId": "bad",
        "version": 0,
        "ttlSec": -1,
        "features": [
            {
                "id": "bad1",
                "type": "unknown",
                "geometry": {"type": "Polygon", "coordinates": []},
            }
        ],
    }
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(invalid), encoding="utf-8")
    errors = validator.validate_file(path, max_bytes=1024)
    assert any("Bundle version" in err for err in errors)
    assert any("ttlSec" in err for err in errors)
    assert any("Unsupported feature type" in err for err in errors)
