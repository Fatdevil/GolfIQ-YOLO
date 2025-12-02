from __future__ import annotations

import math

from .constants import ELEVATION_COEFFICIENT, HEADWIND_COEFFICIENT


def compute_plays_like_distance(
    target_distance_m: float,
    wind_speed_mps: float,
    wind_direction_deg: float,
    elevation_delta_m: float,
) -> float:
    """Return a "plays like" distance adjusted for wind and elevation.

    Positive wind components (headwind) and uphill elevation increase the distance,
    while tailwinds and downhill lies reduce it.
    """

    headwind_component = wind_speed_mps * math.cos(
        math.radians(wind_direction_deg % 360)
    )
    return (
        target_distance_m
        + headwind_component * HEADWIND_COEFFICIENT
        + elevation_delta_m * ELEVATION_COEFFICIENT
    )


__all__ = ["compute_plays_like_distance"]
