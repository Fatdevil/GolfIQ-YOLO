from __future__ import annotations

import argparse
import json
import logging
import sys
import math
import glob
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import (
    Any,
    Dict,
    Iterable,
    List,
    Mapping,
    MutableMapping,
    NamedTuple,
    Sequence,
    Tuple,
)

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


class ManifestEntry(NamedTuple):
    course_id: str
    source: Path
    name: str | None = None


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
            raise ValueError(
                f"Unsupported mapped type '{raw_value}' for key '{raw_key}'"
            )
        normalized[key] = value
    return normalized


def _iter_source_files(pattern: str) -> List[Path]:
    matches = sorted(glob.glob(pattern))
    return [Path(match) for match in matches if Path(match).is_file()]


def _resolve_batch_range(spec: str, total: int) -> Tuple[int, int]:
    cleaned = spec.strip()
    if not cleaned or total <= 0:
        return (0, total)
    try:
        if ":" in cleaned:
            start_str, count_str = cleaned.split(":", 1)
            start = max(int(start_str), 0)
            count = max(int(count_str), 0)
        elif "/" in cleaned:
            index_str, groups_str = cleaned.split("/", 1)
            index = max(int(index_str), 1)
            groups = max(int(groups_str), 1)
            size = math.ceil(total / groups) if groups else total
            start = (index - 1) * size
            count = size
        else:
            count = max(int(cleaned), 0)
            start = 0
    except ValueError as exc:  # pragma: no cover - defensive parsing
        raise ValueError(f"Invalid batch specification '{spec}'") from exc
    if count <= 0:
        return (0, total)
    end = min(total, start + count)
    if start >= total:
        return (total, total)
    return (start, end)


def _load_manifest(path: str) -> List[ManifestEntry]:
    manifest_path = Path(path)
    with manifest_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise ValueError("Manifest must be a JSON array")
    base_dir = manifest_path.parent
    entries: List[ManifestEntry] = []
    for index, raw_entry in enumerate(payload):
        if not isinstance(raw_entry, Mapping):
            raise ValueError(f"Manifest entry at index {index} must be an object")
        raw_id = raw_entry.get("id")
        raw_source = raw_entry.get("source")
        if not isinstance(raw_id, str) or not raw_id.strip():
            raise ValueError(f"Manifest entry at index {index} missing course id")
        if not isinstance(raw_source, str) or not raw_source.strip():
            raise ValueError(f"Manifest entry at index {index} missing source path")
        course_id = raw_id.strip()
        source_path = Path(raw_source.strip())
        if not source_path.is_absolute():
            source_path = (base_dir / source_path).resolve()
        course_name = raw_entry.get("name")
        if course_name is not None and not isinstance(course_name, str):
            raise ValueError(f"Manifest entry '{course_id}' name must be a string")
        entries.append(
            ManifestEntry(course_id=course_id, source=source_path, name=course_name)
        )
    return entries


def _extract_kind(
    properties: Mapping[str, Any], kind_map: Mapping[str, str]
) -> str | None:
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


def _filter_geometry(
    feature_type: str, geometry: Mapping[str, Any], tolerance: float
) -> Mapping[str, Any] | None:
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if geom_type == "Polygon":
        if not isinstance(coords, Sequence):
            return None
        simplified = _simplify_polygon(coords, tolerance)
        if not simplified:
            return None
        area = _geo.polygon_area_sq_m(
            [[tuple(pt) for pt in ring] for ring in simplified]
        )
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
            area += _geo.polygon_area_sq_m(
                [[tuple(pt) for pt in ring] for ring in polygon]
            )
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


def _quantize_geometry(
    geometry: Mapping[str, Any], quantum: float
) -> Mapping[str, Any]:
    quantized_coords = _geo.quantize_coordinates(
        geometry.get("coordinates", []), quantum
    )
    if isinstance(quantized_coords, list):
        coords = quantized_coords
    else:
        coords = list(quantized_coords)
    return {"type": geometry.get("type"), "coordinates": coords}


def _canonical_feature(
    feature: Mapping[str, Any],
    feature_id: str,
    feature_type: str,
    geometry: Mapping[str, Any],
) -> Dict[str, Any]:
    canonical = {
        "id": feature_id,
        "type": feature_type,
        "geometry": geometry,
    }
    return canonical


def _resolve_feature_id(
    feature_type: str, counters: MutableMapping[str, int], raw_id: Any | None
) -> str:
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


def _collect_metadata(
    course_id: str, course_name: str | None, features: List[Dict[str, Any]]
) -> Dict[str, Any]:
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
                area_total += _geo.polygon_area_sq_m(
                    [[tuple(pt) for pt in ring] for ring in polygon]
                )
        counts[feature["type"]] += 1

    approx_counts = {
        _pluralize(ftype): counts.get(ftype, 0) for ftype in sorted(SUPPORTED_TYPES)
    }
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


def _print_summary(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    formatted: List[Dict[str, str]] = []
    for row in rows:
        course = str(row.get("courseId", ""))
        feature_count = row.get("feature_count")
        size_bytes = row.get("size_bytes")
        bundle_path = row.get("bundle_path")
        if isinstance(feature_count, int):
            features = f"{feature_count}"
        else:
            features = "?"
        if isinstance(size_bytes, (int, float)) and size_bytes >= 0:
            size_kb = f"{size_bytes / 1024:.1f}"
        else:
            size_kb = "?"
        formatted.append(
            {
                "course": course,
                "features": features,
                "size": size_kb,
                "bundle": str(bundle_path) if bundle_path is not None else "",
            }
        )
    columns: List[Tuple[str, str, str]] = [
        ("Course", "course", "left"),
        ("Features", "features", "right"),
        ("Size (kB)", "size", "right"),
        ("Bundle", "bundle", "left"),
    ]
    widths: Dict[str, int] = {}
    for header, key, _ in columns:
        width = len(header)
        for row in formatted:
            width = max(width, len(row.get(key, "")))
        widths[key] = width
    print("\nSummary:")
    header_line = "  ".join(
        header.ljust(widths[key]) if align == "left" else header.rjust(widths[key])
        for header, key, align in columns
    )
    print(header_line)
    print("  ".join("-" * widths[key] for _, key, _ in columns))
    for row in formatted:
        line = "  ".join(
            (
                row[key].ljust(widths[key])
                if align == "left"
                else row[key].rjust(widths[key])
            )
            for _, key, align in columns
        )
        print(line)


def process_file(
    path: Path,
    args: argparse.Namespace,
    kind_map: Mapping[str, str],
    course_id_override: str | None = None,
    course_name_override: str | None = None,
) -> Dict[str, Any]:
    payload = _load_json(path)
    course_id = course_id_override or payload.get("courseId") or path.stem
    course_name = course_name_override or payload.get("name")

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
        processed = _canonical_feature(
            feature, feature_id, feature_type, quantized_geometry
        )
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
    size_bytes = bundle_path.stat().st_size

    metadata = _collect_metadata(course_id, course_name, processed_features)
    meta_dir = output_dir / "meta"
    meta_dir.mkdir(parents=True, exist_ok=True)
    meta_path = meta_dir / f"{course_id}.json"
    with meta_path.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")

    LOGGER.info(
        "Wrote bundle %s (%d features, %.1fkB)",
        bundle_path,
        len(processed_features),
        size_bytes / 1024 if size_bytes else 0,
    )

    return {
        "courseId": course_id,
        "name": course_name,
        "bundle_path": bundle_path,
        "metadata_path": meta_path,
        "feature_count": len(processed_features),
        "size_bytes": size_bytes,
    }


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate course bundle JSON from raw data"
    )
    parser.add_argument("--in", dest="input_glob", help="Input glob for raw GeoJSON")
    parser.add_argument(
        "--out", dest="out", required=True, help="Output directory for bundles"
    )
    parser.add_argument(
        "--kind-map",
        dest="kind_map",
        help="Optional mapping from source kinds to bundle types",
    )
    parser.add_argument(
        "--manifest",
        dest="manifest",
        help="Optional manifest JSON file describing course bundles",
    )
    parser.add_argument(
        "--batch",
        dest="batch",
        help="Optional batch spec (e.g. '0:10' or '2/5') for manifest runs",
    )
    parser.add_argument(
        "--simplify-m",
        dest="simplify_m",
        type=float,
        default=0.8,
        help="RDP tolerance in metres",
    )
    parser.add_argument(
        "--quant",
        dest="quant",
        type=float,
        default=1e-6,
        help="Coordinate quantisation quantum",
    )
    parser.add_argument(
        "--limit", dest="limit", type=int, default=0, help="Process at most N files"
    )
    parser.add_argument(
        "--log-level", dest="log_level", default="INFO", help="Logging level"
    )
    args = parser.parse_args(argv)
    if not args.input_glob and not args.manifest:
        parser.error("Either --in or --manifest must be provided")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    logging.basicConfig(
        level=getattr(logging, str(args.log_level).upper(), logging.INFO)
    )

    kind_map = _load_kind_map(args.kind_map) if args.kind_map else {}
    jobs: List[Tuple[Path, str | None, str | None]] = []

    if args.manifest:
        manifest_entries = _load_manifest(args.manifest)
        total_manifest = len(manifest_entries)
        if args.batch:
            start, end = _resolve_batch_range(str(args.batch), total_manifest)
            if start >= total_manifest:
                LOGGER.warning(
                    "Batch specification %s produced an empty slice (total entries: %d)",
                    args.batch,
                    total_manifest,
                )
                manifest_entries = []
            else:
                LOGGER.info(
                    "Processing manifest entries %d-%d of %d",
                    start + 1,
                    end,
                    total_manifest,
                )
                manifest_entries = manifest_entries[start:end]
        if args.limit:
            manifest_entries = manifest_entries[: args.limit]
        for entry in manifest_entries:
            jobs.append((entry.source, entry.course_id, entry.name))

    if args.input_glob:
        source_files = _iter_source_files(args.input_glob)
        if args.limit and not args.manifest:
            source_files = source_files[: args.limit]
        for path in source_files:
            jobs.append((path, None, None))

    if not jobs:
        target = args.manifest if args.manifest else args.input_glob
        LOGGER.warning("No input files matched %s", target)
        return 0

    summary: List[Dict[str, Any]] = []
    for path, course_id_override, course_name_override in jobs:
        try:
            result = process_file(
                path, args, kind_map, course_id_override, course_name_override
            )
            summary.append(result)
        except Exception as exc:  # pragma: no cover - defensive
            LOGGER.exception("Failed to process %s: %s", path, exc)
            return 1

    _print_summary(summary)
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(main())
