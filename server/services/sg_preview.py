"""Lightweight strokes-gained preview based on recorded anchors.

This is intentionally simple: it groups anchors per hole, maps each shot to a
coarse category (tee/approach/short/putt) and compares a naive baseline to a
single-stroke assumption. The goal is to surface directional insights while we
iterate on richer SG models.
"""

from __future__ import annotations

from collections import defaultdict
from enum import Enum
from typing import Dict, Iterable, List

from pydantic import BaseModel, Field

from server.schemas.anchors import AnchorOut


class SgCategory(str, Enum):
    TEE = "TEE"
    APPROACH = "APPROACH"
    SHORT = "SHORT"
    PUTT = "PUTT"


class HoleSgPreview(BaseModel):
    hole: int
    sg_by_cat: Dict[SgCategory, float]
    sg_total: float
    gross_score: int
    worst_category: SgCategory | None = None


class RoundSgCategorySummary(BaseModel):
    category: SgCategory
    sg: float


class RoundSgSummary(BaseModel):
    worst_category: SgCategory | None = None
    categories: List[RoundSgCategorySummary] = Field(default_factory=list)


class RoundSgPreview(BaseModel):
    runId: str
    courseId: str | None
    total_sg: float
    sg_by_cat: Dict[SgCategory, float]
    holes: List[HoleSgPreview]
    round_summary: RoundSgSummary | None = None


def _estimate_par_from_shots(total_shots: int) -> int:
    """Infer a loose par hint from the number of shots seen on the hole."""

    if total_shots <= 3:
        return 3
    if total_shots <= 5:
        return 4
    return 5


def _category_distance_hint(category: SgCategory, total_shots: int) -> float:
    """Return a coarse distance hint (metres) for category-specific baselines."""

    par_hint = _estimate_par_from_shots(total_shots)
    tee_distance = {3: 160.0, 4: 380.0, 5: 510.0}[par_hint]

    if category is SgCategory.TEE:
        return tee_distance
    if category is SgCategory.APPROACH:
        return max(110.0, tee_distance * 0.35)
    if category is SgCategory.SHORT:
        return 25.0
    return 6.0


def _expected_tee_strokes(distance_m: float | None) -> float:
    """Expected strokes to complete a tee shot phase.

    The values roughly mirror PGA TOUR scoring averages: longer par-5 tees are
    harder to escape cleanly, while short par-3 tees are closer to a neutral
    stroke. Distances are in metres and clamped into monotone buckets so future
    tuning stays predictable.
    """

    if distance_m is None:
        return 1.45
    if distance_m >= 520:
        return 1.8
    if distance_m >= 430:
        return 1.65
    if distance_m >= 360:
        return 1.55
    if distance_m >= 280:
        return 1.45
    return 1.35


def _expected_approach_strokes(distance_m: float | None) -> float:
    """Expected strokes when playing an approach from the fairway/rough."""

    if distance_m is None:
        return 1.25
    if distance_m >= 200:
        return 1.55
    if distance_m >= 160:
        return 1.4
    if distance_m >= 120:
        return 1.3
    if distance_m >= 80:
        return 1.2
    if distance_m >= 50:
        return 1.1
    return 1.0


def _expected_short_game_strokes(distance_m: float | None) -> float:
    """Expected strokes for chips/pitches around the green."""

    if distance_m is None:
        return 0.95
    if distance_m >= 60:
        return 1.05
    if distance_m >= 40:
        return 1.0
    if distance_m >= 25:
        return 0.95
    if distance_m >= 10:
        return 0.9
    return 0.85


def _expected_putting_strokes(distance_m: float | None) -> float:
    """Expected strokes once on the green.

    Bucketed to keep monotonicity and avoid overfitting – the aim is to give a
    realistic gradient between tap-ins and long lag putts without needing lie
    data.
    """

    if distance_m is None:
        return 1.4
    if distance_m <= 1.0:
        return 1.0
    if distance_m <= 2.0:
        return 1.1
    if distance_m <= 4.0:
        return 1.25
    if distance_m <= 8.0:
        return 1.45
    if distance_m <= 15.0:
        return 1.6
    if distance_m <= 25.0:
        return 1.8
    return 2.0


def baseline_strokes(category: SgCategory, distance_m: float | None) -> float:
    """Category-specific expected strokes for the *first* shot in a bucket.

    This heuristic stays lightweight but mirrors common SG gradients: longer
    shots expect slightly more than a stroke, while tap-ins trend toward 1.0.
    """

    if category is SgCategory.TEE:
        return _expected_tee_strokes(distance_m)
    if category is SgCategory.APPROACH:
        return _expected_approach_strokes(distance_m)
    if category is SgCategory.SHORT:
        return _expected_short_game_strokes(distance_m)
    return _expected_putting_strokes(distance_m)


def _categorize_anchor(anchor: AnchorOut, total_shots: int) -> SgCategory:
    """Assign a coarse category based on shot order within the hole."""

    if anchor.shot == 1:
        return SgCategory.TEE
    if anchor.shot == total_shots:
        return SgCategory.PUTT
    if anchor.shot == total_shots - 1 and total_shots > 3:
        return SgCategory.SHORT
    if anchor.shot == 2:
        return SgCategory.APPROACH
    return SgCategory.SHORT


def _init_category_totals() -> Dict[SgCategory, float]:
    return {category: 0.0 for category in SgCategory}


def compute_sg_preview_for_run(
    run_id: str,
    anchors: Iterable[AnchorOut],
    *,
    course_id: str | None = None,
) -> RoundSgPreview:
    """Compute a lightweight SG preview for the given run.

    Each anchor is treated as a single stroke. We assign a category based on the
    shot index within the hole, derive a bucketed baseline using loose distance
    hints per category, and compare the expected strokes for that category to
    the actual stroke count within the hole. Baselines are only applied to the
    first shot we see in a category for a hole so that taking extra strokes in a
    category can push SG negative.
    """

    anchors_by_hole: Dict[int, List[AnchorOut]] = defaultdict(list)
    for anchor in anchors:
        anchors_by_hole[anchor.hole].append(anchor)

    round_totals = _init_category_totals()
    round_counts = _init_category_totals()
    hole_previews: List[HoleSgPreview] = []

    if not anchors_by_hole:
        summary = RoundSgSummary(
            worst_category=None,
            categories=[
                RoundSgCategorySummary(category=cat, sg=0.0) for cat in SgCategory
            ],
        )
        return RoundSgPreview(
            runId=run_id,
            courseId=course_id,
            total_sg=0.0,
            sg_by_cat=round_totals,
            holes=[],
            round_summary=summary,
        )

    for hole, hole_anchors in sorted(anchors_by_hole.items()):
        hole_anchors.sort(key=lambda item: item.shot)
        hole_totals = _init_category_totals()
        hole_baselines = _init_category_totals()
        total_shots = len(hole_anchors)

        for anchor in hole_anchors:
            category = _categorize_anchor(anchor, total_shots)
            if hole_baselines[category] == 0.0:
                distance_hint = _category_distance_hint(category, total_shots)
                hole_baselines[category] = baseline_strokes(category, distance_hint)
            hole_totals[category] += 1.0

        hole_sg_by_cat = {
            category: hole_baselines[category] - hole_totals[category]
            for category in SgCategory
        }
        for category, sg_value in hole_sg_by_cat.items():
            round_totals[category] += sg_value
            round_counts[category] += hole_totals[category]

        hole_sg_total = sum(hole_sg_by_cat.values())
        observed_categories = [
            item for item in hole_sg_by_cat.items() if hole_totals[item[0]] > 0
        ]
        worst_category = min(
            observed_categories or list(hole_sg_by_cat.items()),
            key=lambda item: item[1],
        )[0]

        hole_previews.append(
            HoleSgPreview(
                hole=hole,
                sg_by_cat=hole_sg_by_cat,
                sg_total=hole_sg_total,
                gross_score=total_shots,
                worst_category=worst_category,
            )
        )

    total_sg = sum(round_totals.values())
    observed_round_categories = [
        item for item in round_totals.items() if round_counts[item[0]] > 0
    ]
    round_worst = min(
        observed_round_categories or list(round_totals.items()),
        key=lambda item: item[1],
    )[0]
    round_summary = RoundSgSummary(
        worst_category=round_worst,
        categories=[
            RoundSgCategorySummary(category=cat, sg=value)
            for cat, value in sorted(
                round_totals.items(), key=lambda item: item[1], reverse=True
            )
        ],
    )

    return RoundSgPreview(
        runId=run_id,
        courseId=course_id,
        total_sg=total_sg,
        sg_by_cat=round_totals,
        holes=hole_previews,
        round_summary=round_summary,
    )
