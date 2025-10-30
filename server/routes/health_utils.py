"""Utility helpers for health metric aggregation."""

from __future__ import annotations

import math
from typing import Any


def safe_rate(hits: Any, samples: Any) -> float:
    """Return hits / samples with zero guard and type coercion."""
    try:
        denom = float(samples)
    except (TypeError, ValueError):
        return 0.0
    if denom <= 0.0:
        return 0.0
    try:
        numer = float(hits)
    except (TypeError, ValueError):
        return 0.0
    return numer / denom


def safe_delta(curr: Any, prev: Any, bound: float = 0.25) -> float:
    """Difference between curr and prev with NaN/Inf guards and optional clamp."""
    try:
        curr_val = float(curr)
        prev_val = float(prev)
    except (TypeError, ValueError):
        return 0.0

    if math.isnan(curr_val) or math.isinf(curr_val):
        return 0.0
    if math.isnan(prev_val) or math.isinf(prev_val):
        return 0.0

    delta = curr_val - prev_val
    if math.isnan(delta) or math.isinf(delta):
        return 0.0

    limit = abs(float(bound)) if bound is not None else None
    if limit is not None and limit >= 0.0:
        if delta > limit:
            return limit
        if delta < -limit:
            return -limit
    return delta
