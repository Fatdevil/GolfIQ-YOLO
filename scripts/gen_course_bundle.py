from __future__ import annotations

import argparse
import glob
import json
import logging
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Sequence

from scripts import _geo, _rdp

SUPPORTED_TYPES = {
    "green",
    "fairway",
    "bunker",
    "hazard",
    "tee",
    "water",
    "cartpath",
}

DEFAULT_TTL_SEC = 24 * 60 * 60
BUNDLE_VERSION = 1

LOGGER = logging.getLogger("bundle.generator")


def _load_kind_map(path: str | None) -> Mapping[str, str]:
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, Mapping):
        raise ValueError("kind map must be a JSON object")
    normalized: Dict[str, str] = {}
    for raw_key, raw_value in data.items():
        key = str(raw_key).strip().lower()
        value = str(raw_value).strip().lower()
        if value not in SUPPORTED_TYPES:
            raise ValueError(f"Unsupported mapped type '{raw_value}' for key '{raw_key}'")
        normalized[key] = value
    return normalized


def _iter_source_files(pattern: str) -> List[Path]:
    matches = sorted(glob.glob(pattern))
    return [Path(match) for match in matches if Path(match).is_file()]


def _extract_kind(properties: Mapping[str, Any], kind_map: Mapping[str, str]) -> str | None:
    for key in ("kind", "type", "feature", "feature_type"):
        if key in properties and properties[key] is not None:
            candidate = str(properties[key]).strip().lower()
            if candidate in kind_map:
                return kind_map[candidate]
            if candidate in SUPPORTED_TYPES:
                return candidate
    return None


def _simplify_polygon(
    coords: Sequence[Sequence[Sequence[float]]], tolerance: float
) -> List[List[List[float]]]:
    simplified: List[List[List[float]]] = []
    if not isinstance(coords, Sequence):
        return []
    for ring in coords:
        if not isinstance(ring, Sequence):
            continue
        points = [tuple(point[:2]) for point in ring if isinstance(point, Sequence)]
        if len(points) < 4:
            return []
        simplified_ring = _rdp.simplify_ring(points, tolerance)
        if len(simplified_ring) < 4:
            return []
        simplified.append([[float(lon), float(lat)] for lon, lat in simplified_ring])
    return simplified


def _simplify_multipolygon(
    coords: Sequence[Sequence[Sequence[Sequence[float]]]], tolerance: float
) -> List[List[List[List[float]]]]:
    simplified: List[List[List[List[float]]]] = []
    if not isinstance(coords, Sequence):
        return []
    for polygon in coords:
        simplified_polygon = _simplify_polygon(polygon, tolerance)
        if simplified_polygon:
            simplified.append(simplified_polygon)
    return simplified


def _simplify_linestring(
    coords: Sequence[Sequence[float]], tolerance: float
) -> List[List[float]]:
    if not isinstance(coords, Sequence):
        return []
    points = [tuple(point[:2]) for point in coords if isinstance(point, Sequence)]
    simplified_points = _rdp.simplify_linestring(points, tolerance)
    if len(simplified_points) < 2:
        return []
    return [[float(lon), float(lat)] for lon, lat in simplified_points]


def _filter_geometry(feature_type: str, geometry: Mapping[str, Any], tolerance: float) -> Mapping[str, Any] | None:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if geom_type == "Polygon":
        if not isinstance(coords, Sequence):
            return None
        simplified = _simplify_polygon(coords, tolerance)
        if not simplified:
            return None
        area = _geo.polygon_area_sq_m([[tuple(pt) for pt in ring] for ring in simplified])
        if area < 1.0:
            return None
        return {"type": "Polygon", "coordinates": simplified}
    if geom_type == "MultiPolygon":
        if not isinstance(coords, Sequence):
            return None
        simplified = _simplify_multipolygon(coords, tolerance)
        if not simplified:
            return None
        area = 0.0
        for polygon in simplified:
            area += _geo.polygon_area_sq_m([[tuple(pt) for pt in ring] for ring in polygon])
        if area < 1.0:
            return None
        return {"type": "MultiPolygon", "coordinates": simplified}
    if geom_type == "LineString":
        if not isinstance(coords, Sequence):
            return None
        simplified = _simplify_linestring(coords, tolerance)
        if not simplified:
            return None
        length = _geo.linestring_length_m([tuple(pt) for pt in simplified])
        if length < 2.0:
            return None
        return {"type": "LineString", "coordinates": simplified}
    LOGGER.warning("Skipping unsupported geometry type '%s'", geom_type)
    return None


def _quantize_geometry(geometry: Mapping[str, Any], quantum: float) -> Mapping[str, Any]:
    quantized_coords = _geo.quantize_coordinates(geometry.get("coordinates", []), quantum)
    if isinstance(quantized_coords, list):
        coords = quantized_coords
    else:
        coords = list(quantized_coords)
    return {"type": geometry.get("type"), "coordinates": coords}


def _canonical_feature(feature: Mapping[str, Any], feature_id: str, feature_type: str, geometry: Mapping[str, Any]) -> Dict[str, Any]:
    canonical = {
        "id": feature_id,
        "type": feature_type,
        "geometry": geometry,
    }
    return canonical


def _resolve_feature_id(feature_type: str, counters: MutableMapping[str, int], raw_id: Any | None) -> str:
    if raw_id:
        candidate = str(raw_id)
        if candidate:
            return candidate
    counters[feature_type] += 1
    return f"{feature_type[0]}{counters[feature_type]}"


def _load_feature_collection(payload: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
    features = payload.get("features", [])
    if isinstance(features, list):
        return [feature for feature in features if isinstance(feature, Mapping)]
    return []


def _load_json(path: Path) -> Mapping[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, Mapping):
        return data
    raise ValueError(f"File {path} must contain a JSON object")


def _pluralize(feature_type: str) -> str:
    if feature_type.endswith("y"):
        return feature_type[:-1] + "ies"
    return feature_type + "s"


def _collect_metadata(course_id: str, course_name: str | None, features: List[Dict[str, Any]]) -> Dict[str, Any]:
    bbox: List[float] = []
    counts: Counter[str] = Counter()
    area_total = 0.0

    for feature in features:
        geometry = feature.get("geometry", {})
        coords = geometry.get("coordinates")
        box = _geo.compute_bbox_from_coordinates(coords)
        if box:
            if not bbox:
                bbox[:] = box
            else:
                bbox[0] = min(bbox[0], box[0])
                bbox[1] = min(bbox[1], box[1])
                bbox[2] = max(bbox[2], box[2])
                bbox[3] = max(bbox[3], box[3])
        if geometry.get("type") in {"Polygon", "MultiPolygon"}:
            if geometry.get("type") == "Polygon":
                coords_iter = [coords]
            else:
                coords_iter = coords
            for polygon in coords_iter:
                area_total += _geo.polygon_area_sq_m([[tuple(pt) for pt in ring] for ring in polygon])
        counts[feature["type"]] += 1

    approx_counts = { _pluralize(ftype): counts.get(ftype, 0) for ftype in sorted(SUPPORTED_TYPES) }
    metadata: Dict[str, Any] = {
        "courseId": course_id,
        "bbox": bbox,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "featureCount": len(features),
        "areaSqM": round(area_total, 2),
        "approx": {key: value for key, value in approx_counts.items() if value},
    }
    if course_name:
        metadata["name"] = course_name
    return metadata


def process_file(path: Path, args: argparse.Namespace, kind_map: Mapping[str, str]) -> None:
    payload = _load_json(path)
    course_id = payload.get("courseId") or path.stem
    course_name = payload.get("name")

    tolerance = float(args.simplify_m)
    quantum = float(args.quant)

    counters: defaultdict[str, int] = defaultdict(int)
    processed_features: List[Dict[str, Any]] = []

    for feature in _load_feature_collection(payload):
        properties = feature.get("properties") if isinstance(feature, Mapping) else {}
        properties = properties if isinstance(properties, Mapping) else {}
        feature_type = _extract_kind(properties, kind_map)
        if not feature_type:
            LOGGER.warning("Skipping feature with unknown kind: %s", path)
            continue
        if feature_type not in SUPPORTED_TYPES:
            LOGGER.warning("Skipping feature with unsupported type '%s'", feature_type)
            continue

        geometry = feature.get("geometry") if isinstance(feature, Mapping) else {}
        geometry = geometry if isinstance(geometry, Mapping) else {}
        simplified_geometry = _filter_geometry(feature_type, geometry, tolerance)
        if not simplified_geometry:
            continue

        quantized_geometry = _quantize_geometry(simplified_geometry, quantum)
        feature_id = _resolve_feature_id(feature_type, counters, feature.get("id"))
        processed = _canonical_feature(feature, feature_id, feature_type, quantized_geometry)
        processed_features.append(processed)

    processed_features.sort(key=lambda f: (f["type"], f["id"]))

    bundle = {
        "courseId": course_id,
        "version": BUNDLE_VERSION,
        "ttlSec": DEFAULT_TTL_SEC,
        "features": processed_features,
    }

    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = output_dir / f"{course_id}.json"
    with bundle_path.open("w", encoding="utf-8") as handle:
        json.dump(bundle, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")

    metadata = _collect_metadata(course_id, course_name, processed_features)
    meta_dir = output_dir / "meta"
    meta_dir.mkdir(parents=True, exist_ok=True)
    meta_path = meta_dir / f"{course_id}.json"
    with meta_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")

    LOGGER.info("Wrote bundle %s (%d features)", bundle_path, len(processed_features))


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate course bundle JSON from raw data")
    parser.add_argument("--in", dest="input_glob", required=True, help="Input glob for raw GeoJSON")
    parser.add_argument("--out", dest="out", required=True, help="Output directory for bundles")
    parser.add_argument("--kind-map", dest="kind_map", help="Optional mapping from source kinds to bundle types")
    parser.add_argument("--simplify-m", dest="simplify_m", type=float, default=0.8, help="RDP tolerance in metres")
    parser.add_argument("--quant", dest="quant", type=float, default=1e-6, help="Coordinate quantisation quantum")
    parser.add_argument("--limit", dest="limit", type=int, default=0, help="Process at most N files")
    parser.add_argument("--log-level", dest="log_level", default="INFO", help="Logging level")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(level=getattr(logging, str(args.log_level).upper(), logging.INFO))

    kind_map = _load_kind_map(args.kind_map) if args.kind_map else {}
    source_files = _iter_source_files(args.input_glob)

    if args.limit:
        source_files = source_files[: args.limit]

    if not source_files:
        LOGGER.warning("No input files matched pattern %s", args.input_glob)
        return 0

    for path in source_files:
        try:
            process_file(path, args, kind_map)
        except Exception as exc:  # pragma: no cover - defensive
            LOGGER.exception("Failed to process %s: %s", path, exc)
            return 1
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(main())
