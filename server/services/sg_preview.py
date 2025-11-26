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

from pydantic import BaseModel

from server.schemas.anchors import AnchorOut


class SgCategory(str, Enum):
    TEE = "TEE"
    APPROACH = "APPROACH"
    SHORT = "SHORT"
    PUTT = "PUTT"


class HoleSgPreview(BaseModel):
    hole: int
    sg_by_cat: Dict[SgCategory, float]


class RoundSgPreview(BaseModel):
    runId: str
    courseId: str | None
    total_sg: float
    sg_by_cat: Dict[SgCategory, float]
    holes: List[HoleSgPreview]


_CATEGORY_DISTANCE_HINTS: Dict[SgCategory, float] = {
    SgCategory.TEE: 220.0,
    SgCategory.APPROACH: 140.0,
    SgCategory.SHORT: 25.0,
    SgCategory.PUTT: 2.5,
}


def baseline_strokes(distance_m: float | None, is_putt: bool) -> float:
    """Very simple baseline strokes for a given lie.

    This is deliberately conservative; it gives us repeatable numbers for a v1
    preview without trying to match tour-grade SG curves.
    """

    if is_putt:
        return 1.8
    if distance_m is None:
        return 1.0
    if distance_m > 200:
        return 3.5
    if distance_m > 100:
        return 2.8
    if distance_m > 30:
        return 2.2
    return 1.5


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
    shot index within the hole, derive a simple baseline using rough distance
    hints per category and compute ``sg = baseline - 1`` per shot.
    """

    anchors_by_hole: Dict[int, List[AnchorOut]] = defaultdict(list)
    for anchor in anchors:
        anchors_by_hole[anchor.hole].append(anchor)

    round_totals = _init_category_totals()
    hole_previews: List[HoleSgPreview] = []

    for hole, hole_anchors in sorted(anchors_by_hole.items()):
        hole_anchors.sort(key=lambda item: item.shot)
        hole_totals = _init_category_totals()
        total_shots = len(hole_anchors)

        for anchor in hole_anchors:
            category = _categorize_anchor(anchor, total_shots)
            baseline = baseline_strokes(
                _CATEGORY_DISTANCE_HINTS.get(category),
                is_putt=category is SgCategory.PUTT,
            )
            sg_value = baseline - 1.0
            hole_totals[category] += sg_value
            round_totals[category] += sg_value

        hole_previews.append(HoleSgPreview(hole=hole, sg_by_cat=hole_totals))

    total_sg = sum(round_totals.values())

    return RoundSgPreview(
        runId=run_id,
        courseId=course_id,
        total_sg=total_sg,
        sg_by_cat=round_totals,
        holes=hole_previews,
    )

