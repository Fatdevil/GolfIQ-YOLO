"""Expected strokes interpolation curves for common lies."""

from __future__ import annotations

import math
from typing import Dict, Iterable, List, Tuple

# Distances are metres. Values roughly match PGA TOUR baselines but are intentionally
# smoothed so the interpolation stays monotonic and inexpensive to evaluate.
CURVES: Dict[str, List[Tuple[float, float]]] = {
    "green": [
        (0.25, 1.00),
        (0.50, 1.02),
        (1.00, 1.10),
        (1.50, 1.20),
        (2.00, 1.30),
        (3.00, 1.45),
        (4.50, 1.60),
        (6.00, 1.70),
        (8.00, 1.78),
        (12.00, 1.95),
        (18.00, 2.15),
        (25.00, 2.30),
    ],
    "fairway": [
        (10.0, 2.00),
        (30.0, 2.90),
        (50.0, 3.10),
        (70.0, 3.25),
        (90.0, 3.40),
        (120.0, 3.70),
        (150.0, 3.95),
        (180.0, 4.20),
        (210.0, 4.45),
        (240.0, 4.70),
    ],
    "rough": [
        (10.0, 2.20),
        (30.0, 3.10),
        (50.0, 3.30),
        (70.0, 3.55),
        (90.0, 3.80),
        (120.0, 4.15),
        (150.0, 4.45),
        (180.0, 4.75),
        (210.0, 5.05),
        (240.0, 5.35),
    ],
    "sand": [
        (5.0, 2.10),
        (15.0, 2.60),
        (25.0, 2.90),
        (40.0, 3.25),
        (60.0, 3.60),
        (90.0, 4.05),
        (120.0, 4.45),
    ],
    "recovery": [
        (10.0, 2.30),
        (25.0, 2.90),
        (40.0, 3.35),
        (60.0, 3.80),
        (90.0, 4.35),
        (120.0, 4.85),
    ],
    "tee": [
        (80.0, 2.60),
        (120.0, 2.95),
        (150.0, 3.25),
        (180.0, 3.55),
        (210.0, 3.85),
        (240.0, 4.15),
        (270.0, 4.45),
        (300.0, 4.75),
    ],
}

_LOG_TAIL_COEFF = 0.08


def _interp(points: List[Tuple[float, float]], x: float) -> float:
    """Piecewise-linear interpolation helper."""

    if not points:
        raise ValueError("points must not be empty")

    distance = float(x)

    if distance <= points[0][0]:
        return points[0][1]

    if distance >= points[-1][0]:
        return points[-1][1]

    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if x1 <= distance <= x2:
            span = x2 - x1
            if span <= 0:  # pragma: no cover - guard against malformed data
                return y2
            fraction = (distance - x1) / span
            return y1 + fraction * (y2 - y1)

    return points[-1][1]


def _validate_curve_points(points: Iterable[Tuple[float, float]]) -> None:
    """Ensure points are strictly increasing in distance."""

    last_distance = None
    for distance, _ in points:
        if last_distance is not None and distance <= last_distance:
            raise ValueError("Curve distances must be strictly increasing")
        last_distance = distance


for lie_name, pts in CURVES.items():
    _validate_curve_points(pts)


def _normalise_lie(lie: str | None) -> str:
    if not lie:
        return "fairway"
    return lie.strip().lower() or "fairway"


def expected_strokes(distance_m: float, lie: str) -> float:
    """Piecewise-linear interpolation on ``CURVES[lie]`` with a log tail."""

    if distance_m <= 0:
        return 0.0

    lie_key = _normalise_lie(lie)
    points = CURVES.get(lie_key, CURVES["fairway"])
    distance = float(distance_m)

    if distance <= points[0][0]:
        return points[0][1]

    if distance >= points[-1][0]:
        over = distance - points[-1][0]
        return points[-1][1] + _LOG_TAIL_COEFF * math.log1p(over)

    return _interp(points, distance)


__all__ = ["CURVES", "expected_strokes", "_interp"]
