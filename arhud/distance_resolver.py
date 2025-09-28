from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

EARTH_RADIUS_M = 6371000.0


@dataclass
class DistanceResult:
    meters: float
    clamped: bool


def _haversine(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, p1)
    lat2, lon2 = map(math.radians, p2)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_M * c


def resolve_distance(
    device_latlon: Tuple[float, float],
    target_latlon: Tuple[float, float],
    accuracy_radius: float,
    anchor_confidence: float,
) -> DistanceResult:
    great_circle = _haversine(device_latlon, target_latlon)
    adjusted = great_circle * (1 - 0.1 * (1 - anchor_confidence))
    clamped = False
    if adjusted - great_circle > accuracy_radius:
        adjusted = great_circle + accuracy_radius
        clamped = True
    return DistanceResult(meters=round(adjusted), clamped=clamped)
