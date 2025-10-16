"""Ramer–Douglas–Peucker simplification utilities."""
from __future__ import annotations

from typing import List, Sequence, Tuple

from . import _geo

Point = Tuple[float, float]


def _point_segment_distance(point: Point, start: Point, end: Point) -> float:
    if start == end:
        return _geo.haversine_meters(point, start)

    projected = _geo.to_planar([start, end, point])
    start_xy, end_xy, point_xy = projected
    sx, sy = start_xy
    ex, ey = end_xy
    px, py = point_xy

    dx = ex - sx
    dy = ey - sy
    if dx == 0 and dy == 0:
        return ((px - sx) ** 2 + (py - sy) ** 2) ** 0.5

    t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = sx + t * dx
    proj_y = sy + t * dy
    return ((px - proj_x) ** 2 + (py - proj_y) ** 2) ** 0.5


def rdp_simplify(points: Sequence[Point], epsilon: float) -> List[Point]:
    """Simplify a polyline using the RDP algorithm with tolerance epsilon (metres)."""
    if len(points) < 3 or epsilon <= 0:
        return list(points)

    start = points[0]
    end = points[-1]
    max_distance = -1.0
    index = -1

    for i in range(1, len(points) - 1):
        distance = _point_segment_distance(points[i], start, end)
        if distance > max_distance:
            max_distance = distance
            index = i

    if max_distance > epsilon and index > 0:
        left = rdp_simplify(points[: index + 1], epsilon)
        right = rdp_simplify(points[index:], epsilon)
        return left[:-1] + right
    return [start, end]


def simplify_ring(points: Sequence[Point], epsilon: float) -> List[Point]:
    if not points:
        return []
    closed = points[0] == points[-1]
    simplified = rdp_simplify(points, epsilon)
    if closed:
        if simplified[0] != simplified[-1]:
            simplified.append(simplified[0])
        if len(simplified) < 4:
            return list(points[:4]) if len(points) >= 4 else list(points)
    return simplified


def simplify_linestring(points: Sequence[Point], epsilon: float) -> List[Point]:
    simplified = rdp_simplify(points, epsilon)
    if len(simplified) < 2:
        return list(points[:2]) if len(points) >= 2 else list(points)
    return simplified
