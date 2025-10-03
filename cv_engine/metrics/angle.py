from __future__ import annotations

import math
from typing import Sequence, Tuple

Point = Tuple[float, float]


def compute_side_angle(track: Sequence[Point]) -> float | None:
    """Compute side angle (deg) relative to forward axis using first/last points."""

    if len(track) < 2:
        return None
    x0, y0 = track[0]
    x1, y1 = track[-1]
    dx = x1 - x0
    dy = y1 - y0
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return 0.0
    angle_rad = math.atan2(dx, max(dy, 1e-6))
    return math.degrees(angle_rad)
