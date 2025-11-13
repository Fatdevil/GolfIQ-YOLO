"""Pure strokes-gained computation helpers."""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable, List, Tuple

from .curves import expected_strokes
from .schemas import HoleSG, ShotEvent, ShotSG


def _normalise_lie(lie: str) -> str:
    value = (lie or "").strip().lower()
    if not value:
        return "fairway"
    if value == "holed":
        return "holed"
    return value


def _penalty_value(flag: bool | str | None) -> bool:
    if isinstance(flag, bool):
        return flag
    if isinstance(flag, str):
        lowered = flag.strip().lower()
        if not lowered or lowered in {"0", "none", "false"}:
            return False
        return True
    return bool(flag)


def _shot_delta(event: ShotEvent) -> Tuple[ShotSG, float]:
    lie_before = _normalise_lie(event.lie_before)
    lie_after = _normalise_lie(event.lie_after)

    before_expectation = expected_strokes(event.distance_before_m, lie_before)

    if lie_after == "holed" or event.distance_after_m <= 0:
        after_expectation = 0.0
    else:
        after_expectation = expected_strokes(event.distance_after_m, lie_after)

    penalty = 1.0 if _penalty_value(event.penalty) else 0.0
    delta = before_expectation - (1.0 + after_expectation + penalty)

    shot = ShotSG(hole=event.hole, shot=event.shot, sg_delta=delta)
    return shot, delta


def compute_round_sg(
    events: Iterable[ShotEvent],
) -> Tuple[float, List[HoleSG], List[ShotSG]]:
    """Aggregate strokes-gained results for a run of shots."""

    shots: List[ShotSG] = []
    hole_totals: dict[int, float] = defaultdict(float)

    # Sort deterministically by hole, then shot number.
    ordered_events = sorted(events, key=lambda e: (e.hole, e.shot))
    for event in ordered_events:
        shot, delta = _shot_delta(event)
        shots.append(shot)
        hole_totals[event.hole] += delta

    holes: List[HoleSG] = []
    for hole_number in sorted(hole_totals):
        hole_shots = [s for s in shots if s.hole == hole_number]
        holes.append(
            HoleSG(
                hole=hole_number,
                sg_total=sum(s.sg_delta for s in hole_shots),
                sg_shots=hole_shots,
            )
        )

    total_sg = sum(shot.sg_delta for shot in shots)
    return total_sg, holes, shots


__all__ = ["compute_round_sg"]
