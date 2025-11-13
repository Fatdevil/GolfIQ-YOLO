"""Pure strokes-gained computation helpers."""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable, List, Tuple

from .curves import expected_strokes
from .schemas import HoleSG, RunSG, ShotEvent, ShotSG


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


def compute_run_sg(
    events: Iterable[ShotEvent],
    *,
    run_id: str | None = None,
) -> RunSG:
    """Compute per-shot, per-hole and total strokes gained for a run."""

    source_events = list(events)
    if not source_events:
        resolved_run_id = run_id or ""
        return RunSG(run_id=resolved_run_id, sg_total=0.0, holes=[], shots=[])

    resolved_run_id = run_id or source_events[0].run_id or ""

    shots: List[ShotSG] = []
    hole_totals: dict[int, float] = defaultdict(float)

    ordered_events = sorted(source_events, key=lambda e: (e.hole, e.shot))
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
    return RunSG(run_id=resolved_run_id, sg_total=total_sg, holes=holes, shots=shots)


def compute_round_sg(
    events: Iterable[ShotEvent],
) -> Tuple[float, List[HoleSG], List[ShotSG]]:
    """Backward-compatible tuple return used by older call sites."""

    run = compute_run_sg(events)
    return run.sg_total, run.holes, run.shots


__all__ = ["compute_round_sg", "compute_run_sg"]
