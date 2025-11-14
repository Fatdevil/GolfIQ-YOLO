"""Club selection logic building on the plays-like engine."""

from __future__ import annotations

from typing import Dict, List, Tuple

from .config import MIN_CONFIDENCE_NORMAL
from .playslike import plays_like
from .schemas import AdviseIn, AdviseOut


def _choose_club(
    plays_like_m: float, carries: Dict[str, float]
) -> Tuple[str, List[str], bool]:
    """Pick the first club that covers the plays-like distance, else the longest."""
    candidates = sorted(carries.items(), key=lambda item: item[1])
    choice: Tuple[str, float] | None = None
    matched = False
    for club, dist in candidates:
        if dist >= plays_like_m - 2.0:
            choice = (club, dist)
            matched = True
            break
    if not choice and candidates:
        choice = candidates[-1]
    if not choice:
        raise ValueError("bag must contain at least one club")
    club, dist = choice
    reasoning = [f"Target {plays_like_m:.0f} m plays-like; {club} avg {dist:.0f} m"]
    return club, reasoning, matched


def _compute_confidence(
    plays_like_m: float,
    carries: Dict[str, float],
    matched: bool,
) -> float:
    """Derive a simple confidence score between 0 and 1."""
    if not carries:
        return 0.0
    confidence = 1.0
    distances = list(carries.values())
    max_dist = max(distances)
    min_dist = min(distances)
    if len(distances) < 3:
        confidence = min(confidence, 0.55)
    if not matched:
        confidence = min(confidence, 0.45)
    if plays_like_m > max_dist + 10.0:
        confidence = min(confidence, 0.4)
    if plays_like_m < max_dist * 0.4 or plays_like_m < min_dist - 60.0:
        confidence = min(confidence, 0.6)
    return round(confidence, 2)


def advise(inp: AdviseIn) -> AdviseOut:
    """Generate advice for the provided shot context."""
    plays_like_m, breakdown = plays_like(
        inp.shot.before_m,
        inp.env.wind_mps,
        inp.env.wind_dir_deg,
        inp.shot.target_bearing_deg,
        inp.env.temp_c,
        inp.env.elev_delta_m,
    )
    lines: List[str] = []
    matched = False
    club: str | None = None
    try:
        club, lines, matched = _choose_club(plays_like_m, inp.bag.carries_m)
    except ValueError:
        club = None
        lines = []
        matched = False
    cross = breakdown["crosswind_mps"]
    cross_txt = "no crosswind"
    if abs(cross) >= 1.0:
        cross_txt = "R→L" if cross > 0 else "L→R"
    lines.append(
        "Wind head {head:.2f} m/s, cross {cross_txt} ({pct:.2f}%)".format(
            head=breakdown["headwind_mps"],
            cross_txt=cross_txt,
            pct=breakdown["total_pct"],
        )
    )
    confidence = _compute_confidence(plays_like_m, inp.bag.carries_m, matched)
    silent = False
    silent_reason: str | None = None
    tournament_safe = bool(inp.tournament_safe)
    if tournament_safe:
        silent = True
        silent_reason = "tournament_safe"
        return AdviseOut(
            playsLike_m=None,
            club=None,
            reasoning=[],
            confidence=confidence,
            silent=silent,
            silent_reason=silent_reason,
        )
    if confidence < MIN_CONFIDENCE_NORMAL:
        silent = True
        silent_reason = "low_confidence"
    return AdviseOut(
        playsLike_m=plays_like_m,
        club=club,
        reasoning=lines,
        confidence=confidence,
        silent=silent,
        silent_reason=silent_reason,
    )


__all__ = ["advise"]
