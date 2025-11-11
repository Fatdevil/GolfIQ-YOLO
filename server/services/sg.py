"""Strokes-gained helpers for clip metrics."""

from __future__ import annotations

from bisect import bisect_left
from typing import Iterable, Mapping


_BASELINES: Mapping[str, list[tuple[float, float]]] = {
    "green": [
        (0.5, 1.00),
        (1.5, 1.05),
        (2.0, 1.08),
        (3.0, 1.20),
        (5.0, 1.50),
        (8.0, 1.70),
        (10.0, 1.85),
        (15.0, 2.05),
        (20.0, 2.20),
        (30.0, 2.45),
    ],
    "sand": [
        (1.0, 2.10),
        (5.0, 2.40),
        (10.0, 2.70),
        (20.0, 2.95),
        (40.0, 3.30),
        (60.0, 3.60),
        (90.0, 3.95),
        (120.0, 4.25),
        (150.0, 4.50),
        (200.0, 4.80),
    ],
    "rough": [
        (5.0, 2.40),
        (10.0, 2.70),
        (20.0, 2.95),
        (40.0, 3.25),
        (70.0, 3.65),
        (100.0, 3.95),
        (140.0, 4.30),
        (180.0, 4.55),
        (220.0, 4.80),
        (260.0, 5.05),
    ],
    "fairway": [
        (10.0, 2.45),
        (20.0, 2.70),
        (40.0, 3.00),
        (70.0, 3.30),
        (100.0, 3.55),
        (140.0, 3.85),
        (180.0, 4.10),
        (220.0, 4.30),
        (260.0, 4.55),
        (300.0, 4.80),
    ],
    "tee": [
        (40.0, 3.10),
        (80.0, 3.55),
        (120.0, 3.95),
        (160.0, 4.25),
        (200.0, 4.50),
        (240.0, 4.75),
        (280.0, 4.95),
        (320.0, 5.15),
        (360.0, 5.35),
        (400.0, 5.55),
    ],
}


def _lookup_table(lie: str) -> list[tuple[float, float]]:
    key = lie.lower().strip() if lie else "fairway"
    return list(_BASELINES.get(key, _BASELINES["fairway"]))


def _interpolate(distance_m: float, table: Iterable[tuple[float, float]]) -> float:
    sanitized = max(0.0, float(distance_m))
    points = sorted((max(0.0, d), max(0.0, v)) for d, v in table)
    if not points:
        raise ValueError("baseline table requires at least one point")
    if sanitized <= points[0][0]:
        return points[0][1]
    if sanitized >= points[-1][0]:
        return points[-1][1]
    distances = [d for d, _ in points]
    idx = bisect_left(distances, sanitized)
    if idx <= 0:
        return points[0][1]
    lower_d, lower_v = points[idx - 1]
    upper_d, upper_v = points[idx]
    if upper_d == lower_d:
        return upper_v
    ratio = (sanitized - lower_d) / (upper_d - lower_d)
    return lower_v + ratio * (upper_v - lower_v)


def expected_strokes(distance_m: float, lie: str = "fairway") -> float:
    """Return expected strokes to hole out for the provided distance and lie."""

    table = _lookup_table(lie)
    return _interpolate(distance_m, table)


def sg_delta(
    start_dist_m: float,
    end_dist_m: float | None,
    strokes_used: int,
    lie_start: str = "fairway",
) -> float:
    """Compute the strokes-gained delta for a single shot or clip."""

    if strokes_used < 0:
        raise ValueError("strokes_used must be non-negative")
    start_expectation = expected_strokes(start_dist_m, lie=lie_start)
    end_expectation = 0.0
    if end_dist_m is not None:
        end_expectation = expected_strokes(end_dist_m, lie="green")
    return (start_expectation - end_expectation) - float(strokes_used)


__all__ = ["expected_strokes", "sg_delta"]
