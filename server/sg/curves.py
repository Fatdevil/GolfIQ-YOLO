"""Expected strokes interpolation curves for common lies."""

from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

CURVES: Dict[str, List[Tuple[float, float]]] = {
    "green": [
        (0, 1.00),
        (1, 1.10),
        (2, 1.30),
        (3, 1.50),
        (5, 1.80),
        (8, 2.10),
        (12, 2.40),
        (18, 2.80),
        (25, 3.20),
    ],
    "fairway": [
        (10, 1.40),
        (30, 1.70),
        (50, 2.00),
        (80, 2.30),
        (120, 2.70),
        (150, 3.00),
        (180, 3.30),
        (220, 3.70),
    ],
    "rough": [
        (10, 1.60),
        (30, 1.95),
        (50, 2.25),
        (80, 2.60),
        (120, 3.05),
        (150, 3.35),
        (180, 3.65),
        (220, 4.05),
    ],
    "sand": [
        (10, 1.80),
        (20, 2.10),
        (40, 2.45),
        (60, 2.75),
        (90, 3.10),
        (120, 3.45),
    ],
    "recovery": [
        (10, 1.90),
        (30, 2.30),
        (50, 2.70),
        (80, 3.10),
        (120, 3.60),
    ],
    "tee": [
        (120, 2.70),
        (150, 3.00),
        (180, 3.30),
        (220, 3.70),
        (260, 4.10),
    ],
}


def _validate_curve_points(points: Iterable[Tuple[float, float]]) -> None:
    """Ensure points are strictly increasing in distance."""

    last = None
    for distance, _ in points:
        if last is not None and distance <= last:
            raise ValueError("Curve distances must be strictly increasing")
        last = distance


for lie_name, pts in CURVES.items():
    _validate_curve_points(pts)


def expected_strokes(distance_m: float, lie: str) -> float:
    """Piecewise-linear interpolation on ``CURVES[lie]``."""

    if distance_m <= 0:
        return 0.0

    try:
        points = CURVES[lie]
    except KeyError as exc:  # pragma: no cover - defensive programming
        raise ValueError(f"Unknown lie '{lie}'") from exc

    if distance_m <= points[0][0]:
        return points[0][1]
    if distance_m >= points[-1][0]:
        return points[-1][1]

    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if x1 <= distance_m <= x2:
            span = x2 - x1
            if span == 0:  # pragma: no cover - guard against bad data
                return y2
            fraction = (distance_m - x1) / span
            return y1 + fraction * (y2 - y1)

    # If we reach here something is inconsistent with the curve definition.
    raise RuntimeError("Distance not covered by curve segments")


__all__ = ["CURVES", "expected_strokes"]
