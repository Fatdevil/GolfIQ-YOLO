from __future__ import annotations

import json
from types import SimpleNamespace
from pathlib import Path

from scripts import gen_course_bundle as generator


def _make_args(tmp_path: Path) -> SimpleNamespace:
    return SimpleNamespace(out=str(tmp_path / "out"), simplify_m=0.5, quant=1e-6)


def test_extract_kind_prefers_kind_map() -> None:
    kind = generator._extract_kind(
        {"kind": "PuttingSurface"}, {"puttingsurface": "green"}
    )
    assert kind == "green"


def test_filter_geometry_discards_small_features() -> None:
    tiny_polygon = {
        "type": "Polygon",
        "coordinates": [[[0.0, 0.0], [0.0, 1e-6], [1e-6, 1e-6], [0.0, 0.0]]],
    }
    result = generator._filter_geometry("green", tiny_polygon, tolerance=0.1)
    assert result is None

    tiny_line = {
        "type": "LineString",
        "coordinates": [[0.0, 0.0], [0.0, 1e-6]],
    }
    assert generator._filter_geometry("cartpath", tiny_line, tolerance=0.1) is None


def test_process_file_generates_bundle_and_metadata(tmp_path: Path) -> None:
    raw_course = {
        "courseId": "test_course",
        "name": "Test Course",
        "features": [
            {
                "id": "manual",
                "properties": {"kind": "green"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [0.0, 0.0],
                            [0.0, 0.00002],
                            [0.00002, 0.00002],
                            [0.00002, 0.0],
                            [0.0, 0.0],
                        ]
                    ],
                },
            },
            {
                "properties": {"type": "cartpath"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[0.0, 0.0], [0.00003, 0.00003]],
                },
            },
            {
                "properties": {"kind": "unknown"},
                "geometry": {"type": "Polygon", "coordinates": []},
            },
        ],
    }

    source = tmp_path / "source.json"
    source.write_text(json.dumps(raw_course), encoding="utf-8")

    args = _make_args(tmp_path)
    generator.process_file(source, args, kind_map={})

    bundle_path = Path(args.out) / "test_course.json"
    meta_path = Path(args.out) / "meta" / "test_course.json"

    assert bundle_path.exists()
    assert meta_path.exists()

    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    assert bundle["courseId"] == "test_course"
    assert bundle["ttlSec"] == generator.DEFAULT_TTL_SEC
    assert [feature["type"] for feature in bundle["features"]] == ["cartpath", "green"]

    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    assert metadata["courseId"] == "test_course"
    assert metadata["featureCount"] == 2
    assert metadata["approx"]["cartpaths"] == 1
    assert metadata["approx"]["greens"] == 1
    assert metadata["areaSqM"] > 1.0
    assert metadata["bbox"] == [0.0, 0.0, 0.00003, 0.00003]
    assert metadata["updatedAt"].endswith("Z")
