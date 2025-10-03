from __future__ import annotations

import math
from typing import Sequence, Tuple

Point = Tuple[float, float]


def estimate_vertical_launch(
    track_px: Sequence[Point],
    *,
    ball_diameter_px: float,
    fps: float,
    m_per_px: float,
) -> float | None:
    """Estimate vertical launch angle from first frames using simple rise measurement."""

    if len(track_px) < 3 or ball_diameter_px <= 0 or fps <= 0:
        return None

    meters = [(x * m_per_px, y * m_per_px) for x, y in track_px[:5]]
    x0, y0 = meters[0]
    # Use peak height within first frames
    max_height = max(y for _, y in meters)
    dy = max_height - y0
    dx = meters[min(2, len(meters) - 1)][0] - x0
    if dx == 0:
        return None
    time = min(2, len(meters) - 1) / fps
    if time <= 0:
        return None
    vx = dx / time
    if vx <= 0:
        return None
    vy = dy / time
    angle = math.degrees(math.atan2(vy, vx))
    if angle < -5 or angle > 80:
        return None
    return angle
