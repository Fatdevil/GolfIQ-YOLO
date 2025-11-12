"""Deterministic plays-like distance engine."""

from __future__ import annotations

import math
from typing import Dict, Tuple


def _wind_components(
    wind_mps: float, wind_from_deg: float, target_bearing_deg: float
) -> Tuple[float, float]:
    """Return (headwind_mps, crosswind_mps). Positive headwind means into the wind."""
    rel = math.radians((wind_from_deg - target_bearing_deg + 360.0) % 360.0)
    head = wind_mps * math.cos(rel)  # + = headwind, - = tailwind
    cross = wind_mps * math.sin(rel)  # + right-to-left, - left-to-right
    return head, cross


def plays_like(
    before_m: float,
    wind_mps: float,
    wind_from_deg: float,
    target_bearing_deg: float,
    temp_c: float,
    elev_delta_m: float,
) -> Tuple[float, Dict[str, float]]:
    """Compute plays-like distance with a simple, explainable model."""
    head_mps, cross_mps = _wind_components(wind_mps, wind_from_deg, target_bearing_deg)
    wind_pct = 0.01 * head_mps  # ±1% per m/s headwind component
    temp_pct = -0.002 * (temp_c - 20.0)  # ±2% per 10°C away from 20°C baseline
    elev_pct = 0.009 * elev_delta_m  # ±0.9% per meter of elevation change
    total_pct = wind_pct + temp_pct + elev_pct
    eff = before_m * (1.0 + total_pct)
    plays_like_m = max(1.0, round(eff, 2))
    return plays_like_m, {
        "headwind_mps": round(head_mps, 2),
        "crosswind_mps": round(cross_mps, 2),
        "wind_pct": round(wind_pct * 100, 2),
        "temp_pct": round(temp_pct * 100, 2),
        "elev_pct": round(elev_pct * 100, 2),
        "total_pct": round(total_pct * 100, 2),
    }


__all__ = ["plays_like", "_wind_components"]
