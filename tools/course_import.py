"""Course importer CLI.

This utility converts GeoJSON or OSM exports into the GolfIQ bundle format.
It groups features per hole, normalises coordinates and writes the
``data/courses/{course_id}`` folder structure expected by the API layer.

The tool is intentionally light-weight so it can run inside CI environments
without native geospatial dependencies (GDAL/Shapely).  Normalisation and
simplification are achieved through deterministic rounding and duplicate
point pruning which keeps the output idempotent across runs.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, MutableMapping, Optional, Sequence, Set


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO_ROOT / "data" / "courses"
DEFAULT_PRECISION = 6


@dataclass
class ImportConfig:
    """Configuration extracted from CLI arguments."""

    source: str
    input_path: Path
    course_id: str
    course_name: Optional[str]
    tee_kinds: Set[str]
    green_kinds: Set[str]
    hazard_kinds: Set[str]
    hole_property: str = "hole"
    kind_property: Sequence[str] = ("kind", "feature", "category", "type")
    output_dir: Path = DATA_ROOT


def _parse_kind_values(raw: Optional[str]) -> Set[str]:
    if not raw:
        return set()
    values = {token.strip().lower() for token in raw.split(",") if token.strip()}
    return values


def build_config(args: argparse.Namespace) -> ImportConfig:
    return ImportConfig(
        source=args.source,
        input_path=Path(args.input_path).expanduser().resolve(),
        course_id=args.course_id,
        course_name=args.course_name,
        tee_kinds=_parse_kind_values(args.tee),
        green_kinds=_parse_kind_values(args.green),
        hazard_kinds=_parse_kind_values(args.hazards),
        hole_property=args.hole_property,
        output_dir=(
            Path(args.output_dir).expanduser().resolve()
            if args.output_dir
            else DATA_ROOT
        ),
    )


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import golf course geometry.")
    parser.add_argument(
        "--source",
        choices=("geojson", "osm"),
        required=True,
        help="Input source type (GeoJSON FeatureCollection or Overpass JSON).",
    )
    parser.add_argument("--in", dest="input_path", required=True, help="Input file.")
    parser.add_argument("--course-id", required=True, help="Slug for output folder.")
    parser.add_argument("--course-name", help="Friendly course name for metadata.")
    parser.add_argument(
        "--tee",
        help="Comma separated feature kinds that should be treated as tees.",
    )
    parser.add_argument(
        "--green",
        help="Comma separated feature kinds that should be treated as greens.",
    )
    parser.add_argument(
        "--hazards",
        help=(
            "Comma separated feature kinds that should be treated as hazards "
            "(bunker, water, etc.)."
        ),
    )
    parser.add_argument(
        "--output-dir",
        help="Override output root (defaults to data/courses inside repo).",
    )
    parser.add_argument(
        "--hole-property",
        default="hole",
        help="Property name that stores the hole number in the input data.",
    )
    return parser.parse_args(argv)


def _round_coord(value: float, precision: int = DEFAULT_PRECISION) -> float:
    return round(float(value), precision)


def _dedupe_points(points: Iterable[Sequence[float]]) -> List[List[float]]:
    deduped: List[List[float]] = []
    last: Optional[List[float]] = None
    for lon, lat in points:
        rounded = [_round_coord(lon), _round_coord(lat)]
        if last is not None and rounded == last:
            continue
        deduped.append(rounded)
        last = rounded
    return deduped


def _normalize_geometry(
    geometry: MutableMapping[str, object],
) -> MutableMapping[str, object]:
    geo_type = geometry.get("type")
    if geo_type == "Point":
        coords = geometry.get("coordinates")
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            geometry["coordinates"] = [
                _round_coord(coords[0]),
                _round_coord(coords[1]),
            ]
    elif geo_type == "Polygon":
        coords = geometry.get("coordinates")
        if isinstance(coords, list):
            rings: List[List[List[float]]] = []
            for ring in coords:
                deduped = _dedupe_points(ring)
                if deduped and deduped[0] != deduped[-1]:
                    deduped.append(deduped[0])
                if len(deduped) >= 4:
                    rings.append(deduped)
            geometry["coordinates"] = rings
    return geometry


def _read_geojson(path: Path) -> List[Dict]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    features = payload.get("features") if isinstance(payload, dict) else None
    if not isinstance(features, list):
        raise ValueError("GeoJSON input must contain a FeatureCollection")
    return [feature for feature in features if isinstance(feature, dict)]


def _read_osm(path: Path) -> List[Dict]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    features: List[Dict] = []
    for element in payload.get("elements", []):
        if not isinstance(element, dict):
            continue
        tags = element.get("tags", {})
        if not isinstance(tags, dict):
            tags = {}
        golf_tag = str(tags.get("golf", "")).lower()
        hole_number = (
            tags.get("ref")
            or tags.get("hole")
            or element.get("hole")
            or tags.get("golf:hole")
        )
        try:
            hole_value = int(hole_number) if hole_number is not None else None
        except (TypeError, ValueError):
            hole_value = None

        geometry: Optional[Dict[str, object]] = None
        if element.get("type") == "node" and {"lat", "lon"} <= element.keys():
            geometry = {
                "type": "Point",
                "coordinates": [element["lon"], element["lat"]],
            }
        else:
            coords = element.get("geometry")
            if isinstance(coords, list) and coords:
                ring = [[node.get("lon"), node.get("lat")] for node in coords]
                ring = [pt for pt in ring if pt[0] is not None and pt[1] is not None]
                if ring:
                    geometry = {"type": "Polygon", "coordinates": [ring]}

        if geometry is None:
            continue

        feature = {
            "type": "Feature",
            "id": str(element.get("id", "")),
            "geometry": geometry,
            "properties": {
                "kind": golf_tag or tags.get("type") or "feature",
                "name": tags.get("name"),
                "hole": hole_value,
            },
        }
        features.append(feature)
    return features


def _load_features(config: ImportConfig) -> List[Dict]:
    if config.source == "geojson":
        return _read_geojson(config.input_path)
    return _read_osm(config.input_path)


def _feature_kind(feature: Dict, config: ImportConfig) -> str:
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        return ""
    for key in config.kind_property:
        value = properties.get(key)
        if value is not None:
            return str(value).lower()
    return ""


def _hole_number(feature: Dict, config: ImportConfig) -> Optional[int]:
    properties = feature.get("properties")
    if not isinstance(properties, dict):
        return None
    value = properties.get(config.hole_property) or properties.get("hole")
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _ensure_feature_id(feature: Dict, course_id: str, hole: int, index: int) -> str:
    feature_id = feature.get("id")
    if feature_id:
        return str(feature_id)
    return f"{course_id}-{hole}-{index}"


def _normalise_feature(feature: Dict) -> Dict:
    geometry = feature.get("geometry")
    if isinstance(geometry, dict):
        feature["geometry"] = _normalize_geometry(geometry)
    return feature


def _features_by_hole(
    features: Iterable[Dict], config: ImportConfig
) -> Dict[int, List[Dict]]:
    grouped: Dict[int, List[Dict]] = defaultdict(list)
    for feature in features:
        hole = _hole_number(feature, config)
        if hole is None:
            continue
        grouped[hole].append(_normalise_feature(feature))
    return grouped


def _write_json_if_changed(path: Path, payload: Dict) -> bool:
    serialised = json.dumps(payload, indent=2, sort_keys=True)
    serialised_with_newline = serialised + "\n"
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing == serialised_with_newline:
            return False
    path.write_text(serialised_with_newline, encoding="utf-8")
    return True


def _build_metadata(
    config: ImportConfig,
    grouped: Dict[int, List[Dict]],
    *,
    existing: Optional[Dict[str, object]] = None,
    holes_changed: bool,
) -> Dict[str, object]:
    tees: Dict[str, List[Dict[str, object]]] = {}
    holes_meta: Dict[str, Dict[str, object]] = {}

    for hole, features in grouped.items():
        counts: Dict[str, int] = defaultdict(int)
        tee_entries: List[Dict[str, object]] = []
        for feature in features:
            kind = _feature_kind(feature, config)
            counts[kind] += 1
            if kind in config.tee_kinds or (not config.tee_kinds and kind == "tee"):
                coords = feature.get("geometry", {}).get("coordinates")
                if isinstance(coords, (list, tuple)):
                    tee_entries.append(
                        {
                            "id": feature.get("id"),
                            "coordinates": coords,
                        }
                    )
        holes_meta[str(hole)] = {
            "featureCounts": dict(sorted(counts.items())),
            "hasPin": counts.get("pin", 0) > 0,
        }
        if tee_entries:
            tees[str(hole)] = tee_entries

    metadata: Dict[str, object] = {
        "id": config.course_id,
        "holes": holes_meta,
    }
    if config.course_name:
        metadata["name"] = config.course_name
    if tees:
        metadata["tees"] = tees
    existing = existing or {}
    previous_without_updated = {
        key: value for key, value in existing.items() if key != "updatedAt"
    }
    if not holes_changed and previous_without_updated == metadata:
        updated_at = existing.get("updatedAt")
    else:
        updated_at = (
            datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )
    metadata["updatedAt"] = updated_at
    return metadata


def _categorise_features(feature: Dict, config: ImportConfig) -> str:
    kind = _feature_kind(feature, config)
    if kind == "pin":
        return "pin"
    if config.tee_kinds and kind in config.tee_kinds:
        return "tee"
    if config.green_kinds and kind in config.green_kinds:
        return "green"
    if config.hazard_kinds and kind in config.hazard_kinds:
        return "hazard"
    if not config.tee_kinds and kind == "tee":
        return "tee"
    if not config.green_kinds and kind.startswith("green"):
        return "green"
    if not config.hazard_kinds and kind in {"bunker", "water", "hazard"}:
        return "hazard"
    return kind or "feature"


def _write_hole_feature_collection(
    course_dir: Path,
    course_id: str,
    hole: int,
    features: List[Dict],
    config: ImportConfig,
) -> bool:
    ordered: List[Dict] = []
    for index, feature in enumerate(
        sorted(features, key=lambda f: str(f.get("id", "")))
    ):
        feature = dict(feature)
        feature["id"] = _ensure_feature_id(feature, course_id, hole, index)
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        properties.setdefault("hole", hole)
        properties.setdefault("kind", _categorise_features(feature, config))
        feature["properties"] = properties
        ordered.append(feature)

    payload = {
        "type": "FeatureCollection",
        "features": ordered,
    }
    hole_path = course_dir / f"hole_{hole}.geojson"
    return _write_json_if_changed(hole_path, payload)


def _maybe_write_postgis(
    config: ImportConfig, grouped: Dict[int, List[Dict]], metadata: Dict[str, object]
) -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return
    try:
        import psycopg  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        print(
            "DATABASE_URL set but psycopg is not available; skipping PostGIS write",
            file=sys.stderr,
        )
        return

    bundle_records = []
    for hole, features in grouped.items():
        bundle_records.append(
            {
                "course_id": config.course_id,
                "hole": hole,
                "features": features,
                "metadata": metadata,
            }
        )

    with psycopg.connect(database_url) as connection:  # pragma: no cover - requires DB
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS course_bundles (
                    course_id text NOT NULL,
                    hole integer NOT NULL,
                    payload jsonb NOT NULL,
                    metadata jsonb NOT NULL,
                    updated_at timestamptz NOT NULL,
                    PRIMARY KEY (course_id, hole)
                )
                """
            )
            for record in bundle_records:
                cursor.execute(
                    """
                    INSERT INTO course_bundles (course_id, hole, payload, metadata, updated_at)
                    VALUES (%(course_id)s, %(hole)s, %(features)s, %(metadata)s, NOW())
                    ON CONFLICT (course_id, hole) DO UPDATE SET
                        payload = EXCLUDED.payload,
                        metadata = EXCLUDED.metadata,
                        updated_at = NOW()
                    """,
                    {
                        "course_id": record["course_id"],
                        "hole": record["hole"],
                        "features": json.dumps(record["features"]),
                        "metadata": json.dumps(record["metadata"]),
                    },
                )
        connection.commit()


def import_course(config: ImportConfig) -> Dict[str, object]:
    features = _load_features(config)
    grouped = _features_by_hole(features, config)

    if not grouped:
        raise ValueError("No hole features detected in input data")

    course_dir = config.output_dir / config.course_id
    course_dir.mkdir(parents=True, exist_ok=True)

    metadata_path = course_dir / "metadata.json"
    existing_metadata: Dict[str, object] = {}
    if metadata_path.exists():
        try:
            existing_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing_metadata = {}

    writes = 0
    holes_changed = False
    for hole, hole_features in grouped.items():
        if _write_hole_feature_collection(
            course_dir, config.course_id, hole, hole_features, config
        ):
            writes += 1
            holes_changed = True

    metadata = _build_metadata(
        config,
        grouped,
        existing=existing_metadata,
        holes_changed=holes_changed,
    )
    if _write_json_if_changed(metadata_path, metadata):
        writes += 1

    _maybe_write_postgis(config, grouped, metadata)

    return {
        "courseId": config.course_id,
        "holes": sorted(grouped.keys()),
        "written": writes,
        "output": str(course_dir),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    config = build_config(args)
    result = import_course(config)
    print(
        f"course={result['courseId']} holes={len(result['holes'])} "
        f"written={result['written']} output={result['output']}"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
