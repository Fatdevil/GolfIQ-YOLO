from __future__ import annotations

from math import asin, atan2, cos, pi, radians, sin, sqrt
from typing import Dict, Optional, Tuple

from .models import Coordinate, CourseHole
from .storage import get_bundle


EARTH_RADIUS_M = 6_371_000.0
DEFAULT_GREEN_OFFSET_M = 8.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute haversine distance between two lat/lon points in meters."""

    lat1_rad = radians(lat1)
    lon1_rad = radians(lon1)
    lat2_rad = radians(lat2)
    lon2_rad = radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_M * c


def _bearing_deg(start: Coordinate, end: Coordinate) -> float:
    lat1 = radians(start[0])
    lat2 = radians(end[0])
    dlon = radians(end[1] - start[1])

    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    bearing = atan2(x, y)
    return (bearing + 2 * pi) % (2 * pi) * 180 / pi


def _move_point(
    origin: Coordinate, bearing_deg: float, distance_m: float
) -> Coordinate:
    if distance_m == 0:
        return origin

    lat1 = radians(origin[0])
    lon1 = radians(origin[1])
    bearing = radians(bearing_deg)
    dr = distance_m / EARTH_RADIUS_M

    lat2 = asin(sin(lat1) * cos(dr) + cos(lat1) * sin(dr) * cos(bearing))
    lon2 = lon1 + atan2(
        sin(bearing) * sin(dr) * cos(lat1), cos(dr) - sin(lat1) * sin(lat2)
    )

    return (lat2 * 180 / pi, lon2 * 180 / pi)


def _green_points_for_hole(
    hole: CourseHole,
) -> Optional[Tuple[Coordinate, Coordinate, Coordinate]]:
    center: Coordinate | None = None
    if hole.green_center:
        center = hole.green_center
    elif hole.polyline:
        center = hole.polyline[-1]

    if center is None:
        return None

    front = back = center
    if len(hole.polyline) >= 2:
        prev = hole.polyline[-2]
        bearing = _bearing_deg(prev, center)
        front = _move_point(center, (bearing + 180) % 360, DEFAULT_GREEN_OFFSET_M)
        back = _move_point(center, bearing, DEFAULT_GREEN_OFFSET_M)

    return (front, center, back)


def compute_hole_distances_from_bundle(
    course_id: str,
    hole: int,
    player_lat: float,
    player_lon: float,
) -> Optional[Dict[str, float]]:
    """
    Look up the hero bundle for (course_id, hole) and compute
    front/center/back distances (in meters) from the player's location.

    Returns a dict like::

        {
            "toFront_m": float,
            "toMiddle_m": float,
            "toBack_m": float,
        }

    or None if the course/hole cannot be resolved.
    """

    bundle = get_bundle(course_id)
    if not bundle:
        return None

    hole_bundle = next((h for h in bundle.holes if h.hole == hole), None)
    if hole_bundle is None:
        return None

    green_points = _green_points_for_hole(hole_bundle)
    if green_points is None:
        return None

    front, middle, back = green_points
    try:
        return {
            "toFront_m": haversine_m(player_lat, player_lon, front[0], front[1]),
            "toMiddle_m": haversine_m(player_lat, player_lon, middle[0], middle[1]),
            "toBack_m": haversine_m(player_lat, player_lon, back[0], back[1]),
        }
    except Exception:
        return None


__all__ = ["compute_hole_distances_from_bundle", "haversine_m"]
