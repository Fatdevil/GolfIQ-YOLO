"""Club selection logic building on the plays-like engine."""

from __future__ import annotations

from typing import Dict, List, Tuple

from .playslike import plays_like
from .schemas import AdviseIn, AdviseOut


def _choose_club(
    plays_like_m: float, carries: Dict[str, float]
) -> Tuple[str, List[str]]:
    """Pick the first club that covers the plays-like distance, else the longest."""
    candidates = sorted(carries.items(), key=lambda item: item[1])
    choice: Tuple[str, float] | None = None
    for club, dist in candidates:
        if dist >= plays_like_m - 2.0:
            choice = (club, dist)
            break
    if not choice and candidates:
        choice = candidates[-1]
    if not choice:
        raise ValueError("bag must contain at least one club")
    club, dist = choice
    reasoning = [f"Target {plays_like_m:.0f} m plays-like; {club} avg {dist:.0f} m"]
    return club, reasoning


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
    club, lines = _choose_club(plays_like_m, inp.bag.carries_m)
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
    return AdviseOut(playsLike_m=plays_like_m, club=club, reasoning=lines)


__all__ = ["advise"]
