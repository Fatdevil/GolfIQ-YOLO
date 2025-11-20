"""Hole suggestion helpers based on hero course bundles and GNSS positions."""

from __future__ import annotations

from typing import Iterable, Optional, Tuple

from pydantic import BaseModel

from server.bundles.geometry import haversine_m
from server.bundles.models import CourseBundle, CourseHole, Coordinate


class SuggestedHole(BaseModel):
    hole: int
    distance_m: float
    confidence: float
    reason: str


def _hole_reference_point(hole: CourseHole) -> Optional[Coordinate]:
    """Return a representative point for the hole (prefers green center)."""

    if hole.green_center:
        return hole.green_center
    if hole.polyline:
        return hole.polyline[-1]
    return None


def _iter_hole_points(bundle: CourseBundle) -> Iterable[Tuple[int, Coordinate]]:
    for hole in bundle.holes:
        point = _hole_reference_point(hole)
        if point is None:
            continue
        yield (hole.hole, point)


def _confidence_from_distance(distance_m: float) -> float:
    return max(0.0, min(1.0, 1.0 - distance_m / 200.0))


def _next_hole_number(bundle: CourseBundle, last_hole: int) -> Optional[int]:
    hole_numbers = [hole.hole for hole in bundle.holes]
    if not hole_numbers:
        return None

    candidate = last_hole + 1
    if candidate in hole_numbers:
        return candidate

    max_hole = max(hole_numbers)
    min_hole = min(hole_numbers)
    if last_hole >= max_hole and min_hole == 1:
        return 1

    return None


def suggest_hole_for_location(
    *,
    bundle: CourseBundle,
    lat: float,
    lon: float,
    last_hole: Optional[int] = None,
    max_distance_m: float = 500.0,
) -> Optional[SuggestedHole]:
    """
    Suggest the most likely hole for a given location within a course bundle.

    The algorithm favors the nearest green center but applies a gentle bias
    toward ``last_hole + 1`` when that next hole is plausibly close, to keep the
    flow moving forward between holes.
    """

    hole_points = list(_iter_hole_points(bundle))
    if not hole_points:
        return None

    distances = []
    for hole_number, (hole_lat, hole_lon) in hole_points:
        distance = haversine_m(lat, lon, hole_lat, hole_lon)
        distances.append((hole_number, distance))

    if not distances:
        return None

    distances.sort(key=lambda item: item[1])
    nearest_hole, nearest_distance = distances[0]

    if nearest_distance > max_distance_m:
        return None

    selected_hole = nearest_hole
    selected_distance = nearest_distance
    reason = "nearest_green"

    if last_hole is not None:
        expected_hole = _next_hole_number(bundle, last_hole)
        if expected_hole is not None:
            expected_distance = next(
                (dist for hole, dist in distances if hole == expected_hole), None
            )
            if expected_distance is not None:
                bias_threshold = max(nearest_distance * 1.5, 80.0)
                if expected_distance <= bias_threshold:
                    selected_hole = expected_hole
                    selected_distance = expected_distance
                    reason = "nearest_next_hole"

    confidence = _confidence_from_distance(selected_distance)

    return SuggestedHole(
        hole=selected_hole,
        distance_m=selected_distance,
        confidence=confidence,
        reason=reason,
    )


__all__ = [
    "SuggestedHole",
    "suggest_hole_for_location",
]
