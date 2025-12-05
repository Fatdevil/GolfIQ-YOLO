from __future__ import annotations

from typing import Literal, TypedDict

from server.rounds.models import RoundCategoryStats, RoundSummary
from server.rounds.recap import CATEGORY_LABELS, PUTT_BUCKET_LABELS

CategoryKey = Literal["driving", "approach", "short_game", "putting"]


class CategoryStrokesGained(TypedDict):
    value: float
    label: str
    comment: str
    grade: str


class StrokesGainedResult(TypedDict):
    round_id: str
    categories: dict[CategoryKey, CategoryStrokesGained]
    total: float


DRIVING_FAIRWAY_TARGET = 0.55
DRIVING_FAIRWAY_SPREAD = 0.2
DRIVING_PENALTY_WEIGHT = 4.0

APPROACH_GIR_TARGET = 0.5
APPROACH_GIR_SPREAD = 0.2

SHORT_GAME_TARGET_PER_HOLE = 0.6
SHORT_GAME_SPREAD = 0.4

PUTTING_TARGET_PER_HOLE = 1.8
PUTTING_SPREAD = 0.6

NO_DATA_GRADE = "N/A"


def _clamp(value: float, *, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _score_from_ratio(value: float, *, target: float, spread: float) -> float:
    """Map a ratio to roughly [-3, 3] around a target value."""

    if spread <= 0:
        return 0.0
    centered = (value - target) / spread
    return _clamp(centered * 3, minimum=-3.0, maximum=3.0)


def _score_from_inverse(value: float, *, target: float, spread: float) -> float:
    """Higher is worse; invert the delta."""

    if spread <= 0:
        return 0.0
    centered = (target - value) / spread
    return _clamp(centered * 3, minimum=-3.0, maximum=3.0)


def _grade_from_value(value: float | None) -> str:
    if value is None:
        return NO_DATA_GRADE
    if value >= 1.0:
        return "A"
    if value >= 0.0:
        return "B"
    if value >= -1.0:
        return "C"
    return "D"


def _safe_divide(numerator: float, denominator: float) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _stats_from_summary(summary: RoundSummary) -> RoundCategoryStats:
    return RoundCategoryStats(
        round_id=summary.round_id,
        player_id=summary.player_id,
        tee_shots=summary.tee_shots or 0,
        approach_shots=summary.approach_shots or 0,
        short_game_shots=summary.short_game_shots or 0,
        putts=(summary.putting_shots or summary.total_putts or 0),
        penalties=(summary.penalties or summary.total_penalties or 0),
    )


def _build_driving(
    summary: RoundSummary, category_stats: RoundCategoryStats
) -> CategoryStrokesGained:
    fairway_pct = None
    if summary.fairways_hit is not None and summary.fairways_total:
        fairway_pct = summary.fairways_hit / summary.fairways_total

    penalty_rate = _safe_divide(category_stats.penalties or 0, summary.tee_shots or 0)

    base_score = (
        _score_from_ratio(
            fairway_pct, target=DRIVING_FAIRWAY_TARGET, spread=DRIVING_FAIRWAY_SPREAD
        )
        if fairway_pct is not None
        else None
    )
    value = (base_score or 0.0) - (penalty_rate or 0) * DRIVING_PENALTY_WEIGHT
    value = _clamp(value, minimum=-3.0, maximum=3.0)

    if fairway_pct is None and penalty_rate is None:
        return CategoryStrokesGained(
            value=0.0,
            label=CATEGORY_LABELS["driving"],
            grade=NO_DATA_GRADE,
            comment="Not enough tee shots to evaluate driving.",
        )

    parts: list[str] = []
    if fairway_pct is not None:
        parts.append(f"{fairway_pct * 100:.0f}% fairways hit")
    if penalty_rate:
        parts.append(f"{penalty_rate * 100:.0f}% penalties from tee")

    miss_counts = {
        "left": summary.fairway_miss_left or 0,
        "right": summary.fairway_miss_right or 0,
        "long": summary.fairway_miss_long or 0,
        "short": summary.fairway_miss_short or 0,
    }
    if summary.fairways_total:
        dominant = max(miss_counts, key=miss_counts.get)
        if miss_counts[dominant] >= max(2, summary.fairways_total * 0.35):
            parts.append(
                f"Typical miss: {dominant} ({miss_counts[dominant]}/{summary.fairways_total})"
            )

    return CategoryStrokesGained(
        value=value,
        label=CATEGORY_LABELS["driving"],
        comment="; ".join(parts) if parts else "Steady driving data recorded.",
        grade=_grade_from_value(value),
    )


def _build_approach(summary: RoundSummary) -> CategoryStrokesGained:
    holes = summary.holes_played or 0
    gir_pct = _safe_divide(summary.gir_count or 0, holes)
    if gir_pct is None:
        return CategoryStrokesGained(
            value=0.0,
            label=CATEGORY_LABELS["approach"],
            grade=NO_DATA_GRADE,
            comment="Not enough approach data to rate.",
        )

    value = _score_from_ratio(
        gir_pct, target=APPROACH_GIR_TARGET, spread=APPROACH_GIR_SPREAD
    )
    return CategoryStrokesGained(
        value=value,
        label=CATEGORY_LABELS["approach"],
        grade=_grade_from_value(value),
        comment=f"{gir_pct * 100:.0f}% greens in regulation",
    )


def _build_short_game(summary: RoundSummary) -> CategoryStrokesGained:
    holes = summary.holes_played or 0
    per_hole = _safe_divide(summary.short_game_shots or 0, holes)
    if per_hole is None:
        return CategoryStrokesGained(
            value=0.0,
            label=CATEGORY_LABELS["short_game"],
            grade=NO_DATA_GRADE,
            comment="Not enough short game shots to rate.",
        )

    value = _score_from_inverse(
        per_hole,
        target=SHORT_GAME_TARGET_PER_HOLE,
        spread=SHORT_GAME_SPREAD,
    )
    return CategoryStrokesGained(
        value=value,
        label=CATEGORY_LABELS["short_game"],
        grade=_grade_from_value(value),
        comment=f"{per_hole:.1f} recovery shots per hole",
    )


def _build_putting(summary: RoundSummary) -> CategoryStrokesGained:
    holes = summary.holes_played or 0
    per_hole = _safe_divide(summary.total_putts or 0, holes)
    if per_hole is None:
        return CategoryStrokesGained(
            value=0.0,
            label=CATEGORY_LABELS["putting"],
            grade=NO_DATA_GRADE,
            comment="Not enough putts to rate.",
        )

    value = _score_from_inverse(
        per_hole,
        target=PUTTING_TARGET_PER_HOLE,
        spread=PUTTING_SPREAD,
    )
    comment = f"{per_hole:.1f} putts per hole"
    if summary.first_putt_bucket_three_putts:
        bucket, count = max(
            summary.first_putt_bucket_three_putts.items(), key=lambda entry: entry[1]
        )
        if count > 0:
            label = PUTT_BUCKET_LABELS.get(bucket, bucket)
            comment = f"{comment}; 3-putts mostly from {label} starts"
    return CategoryStrokesGained(
        value=value,
        label=CATEGORY_LABELS["putting"],
        grade=_grade_from_value(value),
        comment=comment,
    )


def compute_strokes_gained_for_round(
    round_summary: RoundSummary, category_stats: RoundCategoryStats
) -> StrokesGainedResult:
    categories: dict[CategoryKey, CategoryStrokesGained] = {
        "driving": _build_driving(round_summary, category_stats),
        "approach": _build_approach(round_summary),
        "short_game": _build_short_game(round_summary),
        "putting": _build_putting(round_summary),
    }

    total = sum(entry["value"] for entry in categories.values())

    return StrokesGainedResult(
        round_id=round_summary.round_id, categories=categories, total=total
    )


def compute_weekly_strokes_gained(summaries: list[RoundSummary]) -> dict | None:
    if not summaries:
        return None

    per_round = [
        compute_strokes_gained_for_round(summary, _stats_from_summary(summary))
        for summary in summaries
    ]

    category_values: dict[CategoryKey, list[float]] = {
        "driving": [],
        "approach": [],
        "short_game": [],
        "putting": [],
    }
    totals: list[float] = []

    for result in per_round:
        totals.append(result["total"])
        for key, entry in result["categories"].items():
            category_values[key].append(entry["value"])

    aggregated_categories: dict[str, dict[str, float | str]] = {}
    for key, values in category_values.items():
        if not values:
            aggregated_categories[key] = {
                "value": 0.0,
                "grade": NO_DATA_GRADE,
                "label": CATEGORY_LABELS[key],
            }
            continue
        avg_value = sum(values) / len(values)
        aggregated_categories[key] = {
            "value": avg_value,
            "grade": _grade_from_value(avg_value),
            "label": CATEGORY_LABELS[key],
        }

    total_value = sum(totals) / len(totals) if totals else 0.0

    return {
        "total": total_value,
        "categories": aggregated_categories,
    }


__all__ = [
    "CategoryKey",
    "CategoryStrokesGained",
    "StrokesGainedResult",
    "compute_strokes_gained_for_round",
    "compute_weekly_strokes_gained",
]
