"""Pure strokes-gained computation helpers."""

from __future__ import annotations

from typing import Dict, List

from .curves import expected_strokes
from .schemas import HoleSG, RunSGResult, ShotEvent, ShotSG

_PENALTY: Dict[str, float] = {"ob": 2.0, "hazard": 1.0, "unplayable": 1.0}


def _post_shot_lie(distance_after: float, previous_lie: str) -> str:
    """Determine the lie context for the next interpolation."""

    if distance_after <= 0:
        return "green"
    if distance_after <= 25:
        return "green"
    return previous_lie


def shot_sg(
    before_m: float, after_m: float, before_lie: str, penalty: str | None = None
) -> float:
    """Compute strokes-gained delta for a single shot."""

    before_expectation = expected_strokes(before_m, before_lie)
    after_lie = _post_shot_lie(after_m, before_lie)
    after_expectation = 0.0 if after_m <= 0 else expected_strokes(after_m, after_lie)
    delta = before_expectation - after_expectation - 1.0

    if penalty and penalty in _PENALTY:
        delta -= _PENALTY[penalty]

    return round(delta, 4)


def compute_run_sg(events: List[ShotEvent]) -> RunSGResult:
    """Aggregate strokes-gained results for a run of shots."""

    holes: Dict[int, List[ShotEvent]] = {}
    for event in events:
        holes.setdefault(event.hole, []).append(event)

    result_holes: List[HoleSG] = []
    total_sg = 0.0

    for hole_number in sorted(holes):
        hole_events = sorted(holes[hole_number], key=lambda e: e.shot)
        hole_sg = 0.0
        shot_results: List[ShotSG] = []

        for event in hole_events:
            sg_delta = shot_sg(
                event.before_m, event.after_m, event.before_lie, event.penalty
            )
            hole_sg += sg_delta
            shot_results.append(
                ShotSG(hole=hole_number, shot=event.shot, sg_delta=sg_delta)
            )

        result_holes.append(
            HoleSG(hole=hole_number, sg=round(hole_sg, 4), shots=shot_results)
        )
        total_sg += hole_sg

    return RunSGResult(holes=result_holes, total_sg=round(total_sg, 4))


__all__ = ["compute_run_sg", "shot_sg"]
