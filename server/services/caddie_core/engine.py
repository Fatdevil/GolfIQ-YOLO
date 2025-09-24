"""Core dispersion and selection logic for CaddieCore."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, UTC
from typing import Iterable, Mapping

import math
import statistics

from .models import Confidence, LieType

HEADWIND_COEFFICIENT = 1.5
TAILWIND_COEFFICIENT = 1.2
CROSSWIND_MARGIN_COEFFICIENT = 0.5
ELEVATION_COEFFICIENT = 0.8
ROUGH_DISTANCE_PENALTY = 5.0
ROUGH_LATERAL_SIGMA_PENALTY = 1.0
DEFAULT_HAZARD_BUFFER = 5.0
DEFAULT_K_SIGMA_PRIMARY = 1.0
DEFAULT_K_SIGMA_CONSERVATIVE = 1.5
MINIMUM_SAMPLES = 1


def _to_scalar(sample: Mapping, key: str) -> float:
    try:
        return float(sample[key])
    except KeyError as exc:  # pragma: no cover - defensive
        raise ValueError(f"shot sample missing '{key}'") from exc


def compute_dispersion_by_club(
    shot_samples: Iterable[Mapping],
    *,
    minimum_samples: int = MINIMUM_SAMPLES,
) -> dict[str, dict[str, float]]:
    """Aggregate carry and lateral dispersion for each club."""
    grouped: dict[str, dict[str, list[float]]] = defaultdict(lambda: {"carry": [], "lateral": []})

    for sample in shot_samples:
        club = sample.get("club")
        if not club:
            raise ValueError("shot sample missing club")
        grouped[club]["carry"].append(_to_scalar(sample, "carry_m"))
        grouped[club]["lateral"].append(_to_scalar(sample, "lateral_m"))

    now = datetime.now(UTC)
    aggregates: dict[str, dict[str, float]] = {}
    for club, values in grouped.items():
        carries = values["carry"]
        lateral = values["lateral"]
        if len(carries) < minimum_samples:
            raise ValueError(f"not enough samples for club {club}")

        carry_mean = statistics.fmean(carries)
        carry_std = statistics.stdev(carries) if len(carries) > 1 else 0.0
        lateral_std = statistics.stdev(lateral) if len(lateral) > 1 else 0.0

        confidence = _classify_confidence(len(carries), carry_std)
        aggregates[club] = {
            "club": club,
            "count": len(carries),
            "carry_mean": carry_mean,
            "carry_std": carry_std,
            "lateral_std": lateral_std,
            "last_updated": now,
            "confidence": confidence.value,
        }
    return aggregates


def _classify_confidence(sample_count: int, carry_std: float) -> Confidence:
    if sample_count >= 200 and carry_std <= 10:
        return Confidence.HIGH
    if sample_count >= 120 and carry_std <= 15:
        return Confidence.MEDIUM
    return Confidence.LOW


def wind_effect(speed_mps: float, direction_deg: float) -> dict[str, float]:
    """Return carry delta and lateral margin induced by wind."""
    normalized = direction_deg % 360

    if normalized % 180 == 90:
        carry_delta = 0.0
    elif direction_deg < 0 or normalized >= 180:
        carry_delta = -speed_mps * TAILWIND_COEFFICIENT
    else:
        carry_delta = speed_mps * HEADWIND_COEFFICIENT

    lateral_margin = speed_mps * abs(math.sin(math.radians(normalized))) * CROSSWIND_MARGIN_COEFFICIENT

    return {
        "carry_delta_m": carry_delta,
        "lateral_margin_m": lateral_margin,
    }


def elevation_effect(delta_m: float) -> float:
    return delta_m * ELEVATION_COEFFICIENT


def lie_penalty(lie_type: LieType, carry_std: float) -> dict[str, float]:
    if lie_type is LieType.ROUGH:
        return {
            "distance": ROUGH_DISTANCE_PENALTY,
            "lateral_sigma": ROUGH_LATERAL_SIGMA_PENALTY * carry_std,
        }
    return {"distance": 0.0, "lateral_sigma": 0.0}


def choose_club(
    *,
    target_distance_m: float,
    aggregates: dict[str, dict[str, float]],
    hazard_distance_m: float | None,
    lie_type: str,
    k_sigma_primary: float = DEFAULT_K_SIGMA_PRIMARY,
    k_sigma_conservative: float = DEFAULT_K_SIGMA_CONSERVATIVE,
    hazard_buffer_m: float = DEFAULT_HAZARD_BUFFER,
) -> dict[str, object]:
    if not aggregates:
        raise ValueError("no aggregates provided")

    lie = LieType(lie_type)
    clubs = sorted(
        ({"club": club, **stats} for club, stats in aggregates.items()),
        key=lambda item: item["carry_mean"],
    )

    primary = _select_primary(clubs, target_distance_m, lie)

    primary_confidence_enum = _classify_confidence(primary["count"], primary["carry_std"])
    safety_margin = k_sigma_primary * primary["carry_std"] + hazard_buffer_m

    conservative = None
    hazard_flag = False
    if hazard_distance_m is not None and primary["carry_mean"] >= (hazard_distance_m - hazard_buffer_m):
        hazard_flag = True
        conservative = _find_conservative(clubs, primary)

    if primary_confidence_enum is Confidence.LOW:
        conservative = conservative or _find_conservative(clubs, primary)

    conservative_std = (conservative["carry_std"] if conservative else primary["carry_std"])
    conservative_margin = k_sigma_conservative * conservative_std + hazard_buffer_m

    return {
        "club": primary["club"],
        "conservative_club": conservative["club"] if conservative else None,
        "confidence": primary_confidence_enum.value,
        "hazard_flag": hazard_flag,
        "safety_margin_m": safety_margin,
        "conservative_margin_m": conservative_margin,
    }


def _select_primary(
    clubs: list[dict[str, float]], target_distance: float, lie: LieType
) -> dict[str, float]:
    required = target_distance
    for item in clubs:
        if item["carry_mean"] >= required:
            return item
    return clubs[-1]


def _find_conservative(
    clubs: list[dict[str, float]], primary: dict[str, float]
) -> dict[str, float] | None:
    index = clubs.index(primary)
    if index == 0:
        # Fallback: if there is no shorter club in aggregates, reuse primary
        return primary
    return clubs[index - 1]
