"""Strokes-gained helpers for clip metrics."""

from __future__ import annotations

from bisect import bisect_left
from typing import Iterable, Optional

from server.sg.curves import expected_strokes as _expected_strokes


def _interpolate(distance_m: float, table: Iterable[tuple[float, float]]) -> float:
    sanitized = max(0.0, float(distance_m))
    points = sorted((max(0.0, float(d)), float(v)) for d, v in table)
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

    return _expected_strokes(distance_m, lie)


def _resolve_lie_end(
    lie_start: str, lie_end: Optional[str], end_distance: float
) -> str:
    if lie_end:
        return lie_end
    normalized_start = (lie_start or "fairway").strip().lower() or "fairway"
    if end_distance <= 0:
        return "holed"
    if normalized_start == "green" or end_distance <= 25:
        return "green"
    return normalized_start


def sg_delta(
    start_dist_m: float,
    end_dist_m: float | None,
    *,
    strokes_used: int,
    lie_start: str = "fairway",
    lie_end: Optional[str] = None,
    penalty: bool = False,
) -> float:
    """Compute the strokes-gained delta for a single shot or clip."""

    if strokes_used < 0:
        raise ValueError("strokes_used must be non-negative")

    start_expectation = expected_strokes(start_dist_m, lie=lie_start)

    end_expectation = 0.0
    if end_dist_m is not None:
        end_distance = max(0.0, float(end_dist_m))
        lie_after = _resolve_lie_end(lie_start, lie_end, end_distance)
        if lie_after != "holed" and end_distance > 0:
            end_expectation = expected_strokes(end_distance, lie=lie_after)

    penalty_strokes = 1.0 if penalty else 0.0
    return start_expectation - (float(strokes_used) + end_expectation + penalty_strokes)


__all__ = ["expected_strokes", "sg_delta", "_interpolate"]
