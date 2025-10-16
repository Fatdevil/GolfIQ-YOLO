"""Lightweight geographic helpers for bundle tooling."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, getcontext
import math
from typing import Iterable, List, Sequence, Tuple

EARTH_RADIUS_M = 6_371_000.0

Point = Tuple[float, float]

# Ensure enough precision for quantisation routines
getcontext().prec = 16


def haversine_meters(a: Point, b: Point) -> float:
    """Return the haversine distance between two lon/lat points in metres."""
    lon1, lat1 = a
    lon2, lat2 = b

    lon1_rad, lat1_rad = math.radians(lon1), math.radians(lat1)
    lon2_rad, lat2_rad = math.radians(lon2), math.radians(lat2)

    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad

    sin_dlat = math.sin(dlat / 2.0)
    sin_dlon = math.sin(dlon / 2.0)
    h = sin_dlat ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * sin_dlon ** 2
    c = 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))
    return EARTH_RADIUS_M * c


def to_planar(points: Sequence[Point]) -> List[Tuple[float, float]]:
    """Project lon/lat points to a local planar system (metres)."""
    if not points:
        return []
    ref_lat = sum(p[1] for p in points) / len(points)
    ref_lat_rad = math.radians(ref_lat)
    cos_ref = math.cos(ref_lat_rad)

    projected: List[Tuple[float, float]] = []
    for lon, lat in points:
        lon_rad = math.radians(lon)
        lat_rad = math.radians(lat)
        x = EARTH_RADIUS_M * lon_rad * cos_ref
        y = EARTH_RADIUS_M * lat_rad
        projected.append((x, y))
    return projected


def _ring_area(projected: Sequence[Tuple[float, float]]) -> float:
    if len(projected) < 3:
        return 0.0
    area = 0.0
    for i in range(len(projected)):
        x1, y1 = projected[i]
        x2, y2 = projected[(i + 1) % len(projected)]
        area += x1 * y2 - x2 * y1
    return 0.5 * area


def polygon_area_sq_m(coordinates: Sequence[Sequence[Point]]) -> float:
    """Approximate polygon area (outer ring minus holes) in square metres."""
    if not coordinates:
        return 0.0
    outer = coordinates[0]
    projected_outer = to_planar(outer)
    area = abs(_ring_area(projected_outer))
    for ring in coordinates[1:]:
        projected = to_planar(ring)
        area -= abs(_ring_area(projected))
    return max(area, 0.0)


def linestring_length_m(points: Sequence[Point]) -> float:
    if len(points) < 2:
        return 0.0
    distance = 0.0
    for idx in range(len(points) - 1):
        distance += haversine_meters(points[idx], points[idx + 1])
    return distance


def quantize_value(value: float, quantum: float) -> float:
    if quantum <= 0:
        return float(value)
    q = Decimal(str(quantum))
    d = Decimal(str(value))
    return float(d.quantize(q, rounding=ROUND_HALF_UP))


def quantize_coordinates(obj: Iterable, quantum: float) -> Iterable:
    if isinstance(obj, (list, tuple)):
        return [quantize_coordinates(item, quantum) for item in obj]
    if isinstance(obj, (int, float)):
        return quantize_value(float(obj), quantum)
    return obj


def update_bbox(bbox: List[float], point: Point) -> None:
    lon, lat = point
    if not bbox:
        bbox.extend([lon, lat, lon, lat])
        return
    bbox[0] = min(bbox[0], lon)
    bbox[1] = min(bbox[1], lat)
    bbox[2] = max(bbox[2], lon)
    bbox[3] = max(bbox[3], lat)


def compute_bbox_from_coordinates(coords: Iterable) -> List[float]:
    bbox: List[float] = []

    def _walk(node: Iterable) -> None:
        if isinstance(node, (list, tuple)) and node and isinstance(node[0], (int, float)):
            lon, lat = float(node[0]), float(node[1])
            update_bbox(bbox, (lon, lat))
        elif isinstance(node, (list, tuple)):
            for child in node:
                _walk(child)

    _walk(coords)
    return bbox
