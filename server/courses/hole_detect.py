from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
from typing import Literal, Optional

from pydantic import BaseModel

from .schemas import CourseBundle, GeoPoint, HoleBundle

TEE_RADIUS_M = 60.0
GREEN_RADIUS_M = 40.0
STAY_RADIUS_M = 80.0
BETWEEN_MIN_FRACTION = 0.3
BETWEEN_MAX_FRACTION = 0.8
TEE_CONFIDENCE = 0.9
GREEN_CONFIDENCE = 0.9
BETWEEN_CONFIDENCE = 0.8
STAY_CONFIDENCE = 0.6

HoleDetectReason = Literal[
    "closest_tee",
    "closest_green",
    "between_green_and_next_tee",
    "stay_on_current",
]


class HoleSuggestion(BaseModel):
    hole: int
    confidence: float
    reason: HoleDetectReason


def haversine_m(p1: GeoPoint, p2: GeoPoint) -> float:
    """Compute haversine distance between two geographic points in meters."""

    r = 6_371_000.0  # mean Earth radius in meters
    lat1 = radians(p1.lat)
    lon1 = radians(p1.lon)
    lat2 = radians(p2.lat)
    lon2 = radians(p2.lon)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


def hole_center(hole: HoleBundle) -> GeoPoint:
    """Approximate a hole center by averaging tee center and green middle."""

    return GeoPoint(
        lat=(hole.tee_center.lat + hole.green.middle.lat) / 2.0,
        lon=(hole.tee_center.lon + hole.green.middle.lon) / 2.0,
    )


def _find_hole(bundle: CourseBundle, number: int) -> Optional[HoleBundle]:
    return next((hole for hole in bundle.holes if hole.number == number), None)


def suggest_hole(
    bundle: CourseBundle,
    lat: float,
    lon: float,
    current_hole: Optional[int] = None,
) -> Optional[HoleSuggestion]:
    """Suggest a hole based on GNSS position and course geometry."""

    if not bundle.holes:
        return None

    position = GeoPoint(lat=lat, lon=lon)

    holes = bundle.holes
    tee_distances = [
        (hole.number, haversine_m(hole.tee_center, position)) for hole in holes
    ]
    green_distances = [
        (hole.number, haversine_m(hole.green.middle, position)) for hole in holes
    ]

    closest_tee = min(tee_distances, key=lambda item: item[1])
    closest_green = min(green_distances, key=lambda item: item[1])

    if current_hole is not None:
        current = _find_hole(bundle, current_hole)
        if current:
            stay_distance = min(
                haversine_m(current.tee_center, position),
                haversine_m(current.green.middle, position),
            )
            if stay_distance <= STAY_RADIUS_M:
                return HoleSuggestion(
                    hole=current.number,
                    confidence=STAY_CONFIDENCE,
                    reason="stay_on_current",
                )

    tee_hole, tee_distance = closest_tee
    if tee_distance <= TEE_RADIUS_M:
        return HoleSuggestion(
            hole=tee_hole,
            confidence=TEE_CONFIDENCE,
            reason="closest_tee",
        )

    green_hole, green_distance = closest_green
    if green_distance <= GREEN_RADIUS_M:
        return HoleSuggestion(
            hole=green_hole,
            confidence=GREEN_CONFIDENCE,
            reason="closest_green",
        )

    if current_hole is not None and tee_hole == current_hole + 1:
        current = _find_hole(bundle, current_hole)
        next_hole = _find_hole(bundle, current_hole + 1)
        if current and next_hole:
            total_distance = haversine_m(current.green.middle, next_hole.tee_center)
            if total_distance > 0:
                from_green = haversine_m(current.green.middle, position)
                to_next_tee = haversine_m(position, next_hole.tee_center)
                fraction = from_green / total_distance
                path_error = abs((from_green + to_next_tee) - total_distance)
                if (
                    BETWEEN_MIN_FRACTION <= fraction <= BETWEEN_MAX_FRACTION
                    and path_error <= 0.25 * total_distance
                ):
                    return HoleSuggestion(
                        hole=next_hole.number,
                        confidence=BETWEEN_CONFIDENCE,
                        reason="between_green_and_next_tee",
                    )

    return None
