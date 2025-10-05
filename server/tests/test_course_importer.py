from __future__ import annotations

import json
from pathlib import Path

from tools.course_import import ImportConfig, import_course


def _feature(feature_id: str, kind: str, hole: int, geometry: dict) -> dict:
    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": geometry,
        "properties": {"kind": kind, "hole": hole},
    }


def test_geojson_course_import(tmp_path: Path) -> None:
    input_path = tmp_path / "input.geojson"
    features = [
        _feature(
            "test-pin-1",
            "pin",
            1,
            {"type": "Point", "coordinates": [-122.4, 37.7]},
        ),
        _feature(
            "test-tee-1",
            "tee",
            1,
            {"type": "Point", "coordinates": [-122.401, 37.701]},
        ),
        _feature(
            "test-green-1",
            "green",
            1,
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [-122.402, 37.702],
                        [-122.403, 37.702],
                        [-122.403, 37.703],
                        [-122.402, 37.703],
                        [-122.402, 37.702],
                    ]
                ],
            },
        ),
    ]
    input_payload = {"type": "FeatureCollection", "features": features}
    input_path.write_text(json.dumps(input_payload), encoding="utf-8")

    output_dir = tmp_path / "out"
    config = ImportConfig(
        source="geojson",
        input_path=input_path,
        course_id="demo-course",
        course_name="Demo Course",
        tee_kinds={"tee"},
        green_kinds={"green"},
        hazard_kinds={"bunker"},
        hole_property="hole",
        output_dir=output_dir,
    )

    result = import_course(config)
    assert result["courseId"] == "demo-course"
    assert result["written"] >= 2

    course_folder = Path(result["output"])
    metadata_path = course_folder / "metadata.json"
    hole_path = course_folder / "hole_1.geojson"

    assert metadata_path.exists()
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert metadata["id"] == "demo-course"
    assert "updatedAt" in metadata
    assert "1" in metadata["holes"]
    assert metadata.get("tees")

    assert hole_path.exists()
    hole_fc = json.loads(hole_path.read_text(encoding="utf-8"))
    assert hole_fc["type"] == "FeatureCollection"
    assert len(hole_fc["features"]) == 3
    assert {feature["properties"]["kind"] for feature in hole_fc["features"]} == {
        "pin",
        "tee",
        "green",
    }

    second = import_course(config)
    assert second["written"] == 0
