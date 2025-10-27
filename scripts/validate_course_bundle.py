from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence

GREEN_SECTION_VALUES = {"front", "middle", "back"}
GREEN_FAT_SIDE_VALUES = {"L", "R"}

SUPPORTED_TYPES = {
    "green",
    "fairway",
    "bunker",
    "hazard",
    "tee",
    "water",
    "cartpath",
}

SUPPORTED_GEOMETRIES = {"Polygon", "MultiPolygon", "LineString"}
BUNDLE_VERSION = 1


class ValidationError(Exception):
    pass


def _is_sequence(obj: Any) -> bool:
    return isinstance(obj, (list, tuple))


def _validate_polygon_coordinates(coords: Any) -> None:
    if not _is_sequence(coords):
        raise ValidationError("Polygon coordinates must be a sequence of rings")
    if not coords:
        raise ValidationError("Polygon must contain at least one ring")
    for ring in coords:
        if not _is_sequence(ring) or len(ring) < 4:
            raise ValidationError("Polygon ring must contain at least four points")
        for point in ring:
            if not _is_sequence(point) or len(point) < 2:
                raise ValidationError("Polygon points must be coordinate pairs")


def _validate_multipolygon_coordinates(coords: Any) -> None:
    if not _is_sequence(coords) or not coords:
        raise ValidationError("MultiPolygon coordinates must be a sequence of polygons")
    for polygon in coords:
        _validate_polygon_coordinates(polygon)


def _validate_linestring_coordinates(coords: Any) -> None:
    if not _is_sequence(coords) or len(coords) < 2:
        raise ValidationError("LineString must contain at least two points")
    for point in coords:
        if not _is_sequence(point) or len(point) < 2:
            raise ValidationError("LineString points must be coordinate pairs")


def validate_feature(feature: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    feature_type = feature.get("type")
    if feature_type not in SUPPORTED_TYPES:
        errors.append(f"Unsupported feature type: {feature_type}")
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict):
        errors.append("Geometry must be an object")
        return errors
    geometry_type = geometry.get("type")
    if geometry_type not in SUPPORTED_GEOMETRIES:
        errors.append(f"Unsupported geometry type: {geometry_type}")
        return errors
    coordinates = geometry.get("coordinates")
    try:
        if geometry_type == "Polygon":
            _validate_polygon_coordinates(coordinates)
        elif geometry_type == "MultiPolygon":
            _validate_multipolygon_coordinates(coordinates)
        elif geometry_type == "LineString":
            _validate_linestring_coordinates(coordinates)
    except ValidationError as exc:
        errors.append(str(exc))

    green_meta = feature.get("green")
    if green_meta is not None:
        if feature_type != "green":
            errors.append("green metadata is only supported on green features")
        if not isinstance(green_meta, dict):
            errors.append("green metadata must be an object when present")
        else:
            sections = green_meta.get("sections")
            if sections is not None:
                if not isinstance(sections, list):
                    errors.append("green.sections must be an array when provided")
                else:
                    for idx, entry in enumerate(sections):
                        if not isinstance(entry, str):
                            errors.append(f"green.sections[{idx}] must be a string")
                            continue
                        if entry not in GREEN_SECTION_VALUES:
                            errors.append(
                                (
                                    f"green.sections[{idx}] must be one of "
                                    f"{sorted(GREEN_SECTION_VALUES)}"
                                )
                            )
            fat_side = green_meta.get("fatSide")
            if fat_side is not None:
                if not isinstance(fat_side, str):
                    errors.append("green.fatSide must be a string when provided")
                elif fat_side not in GREEN_FAT_SIDE_VALUES:
                    errors.append("green.fatSide must be 'L' or 'R'")
    return errors


def validate_bundle(payload: Dict[str, Any], max_bytes: int | None = None) -> List[str]:
    errors: List[str] = []
    if payload.get("version") != BUNDLE_VERSION:
        errors.append("Bundle version must be 1")
    if "courseId" not in payload:
        errors.append("Missing courseId")
    ttl = payload.get("ttlSec")
    if not isinstance(ttl, int) or ttl <= 0:
        errors.append("ttlSec must be a positive integer")
    features = payload.get("features")
    if not isinstance(features, list):
        errors.append("features must be a list")
        return errors
    for idx, feature in enumerate(features):
        if not isinstance(feature, dict):
            errors.append(f"Feature at index {idx} must be an object")
            continue
        if "id" not in feature:
            errors.append(f"Feature at index {idx} missing id")
        feature_errors = validate_feature(feature)
        errors.extend(f"Feature {idx}: {msg}" for msg in feature_errors)
    if max_bytes is not None and max_bytes > 0:
        size = len(json.dumps(payload, sort_keys=True).encode("utf-8"))
        if size > max_bytes:
            errors.append(f"Bundle exceeds size limit: {size} bytes > {max_bytes}")
    return errors


def validate_file(path: Path, max_bytes: int | None = None) -> List[str]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        return ["Top-level JSON must be an object"]
    return validate_bundle(payload, max_bytes)


def describe_bundle(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:  # pragma: no cover - defensive
        return {"courseId": "", "feature_count": None}
    course_id = payload.get("courseId") if isinstance(payload, dict) else None
    features = payload.get("features") if isinstance(payload, dict) else None
    feature_count = len(features) if isinstance(features, list) else None
    return {
        "courseId": str(course_id) if isinstance(course_id, str) else "",
        "feature_count": feature_count,
    }


def iter_paths(patterns: Sequence[str]) -> List[Path]:
    paths: List[Path] = []
    for pattern in patterns:
        for path in Path().glob(pattern):
            if path.is_file():
                paths.append(path)
    return sorted(set(paths))


def print_summary(rows: List[Dict[str, str]]) -> None:
    if not rows:
        return
    columns: List[tuple[str, str, str]] = [
        ("Status", "status", "left"),
        ("Course", "course", "left"),
        ("Features", "features", "right"),
        ("Size (kB)", "size", "right"),
        ("File", "file", "left"),
    ]
    widths: Dict[str, int] = {}
    for header, key, _ in columns:
        width = len(header)
        for row in rows:
            width = max(width, len(row.get(key, "")))
        widths[key] = width
    print("\nSummary:")
    header_line = "  ".join(
        header.ljust(widths[key]) if align == "left" else header.rjust(widths[key])
        for header, key, align in columns
    )
    print(header_line)
    print("  ".join("-" * widths[key] for _, key, _ in columns))
    for row in rows:
        line = "  ".join(
            (
                row[key].ljust(widths[key])
                if align == "left"
                else row[key].rjust(widths[key])
            )
            for _, key, align in columns
        )
        print(line)


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate course bundle JSON files")
    parser.add_argument("paths", nargs="+", help="Bundle file globs to validate")
    parser.add_argument(
        "--max-kb", type=int, default=200, help="Maximum allowed size per bundle (kB)"
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or [])
    paths = iter_paths(args.paths)
    if not paths:
        print("No bundle files matched", flush=True)
        return 0
    max_bytes = args.max_kb * 1024 if args.max_kb else None
    had_error = False
    summary_rows: List[Dict[str, str]] = []
    for path in paths:
        errors = validate_file(path, max_bytes)
        if errors:
            had_error = True
            print(f"✗ {path}")
            for err in errors:
                print(f"  - {err}")
        else:
            print(f"✓ {path}")
        details = describe_bundle(path)
        feature_count = details.get("feature_count")
        if isinstance(feature_count, int):
            feature_text = str(feature_count)
        else:
            feature_text = "—"
        try:
            size_bytes = path.stat().st_size
            size_text = f"{size_bytes / 1024:.1f}"
        except OSError:
            size_text = "—"
        summary_rows.append(
            {
                "status": "✓" if not errors else "✗",
                "course": details.get("courseId", ""),
                "features": feature_text,
                "size": size_text,
                "file": str(path),
            }
        )
    print_summary(summary_rows)
    return 1 if had_error else 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main(sys.argv[1:]))
