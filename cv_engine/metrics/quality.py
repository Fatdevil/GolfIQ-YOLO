from math import sqrt
from typing import Iterable, Tuple

Point = Tuple[float, float]


def _speeds(pts: list[Point]) -> list[float]:
    return [
        sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:])
    ]


def confidence(
    trk_ball: Iterable[Point], trk_club: Iterable[Point], n_frames: int
) -> float:
    b = list(trk_ball)
    c = list(trk_club)
    if n_frames <= 0:
        return 0.0
    continuity = min(len(b), len(c)) / n_frames
    import statistics as st

    def stab(pts: list[Point]) -> float:
        v = _speeds(pts)
        if len(v) < 2:
            return 0.0
        mu = max(1e-6, st.fmean(v))
        cv = min(1.0, (st.pstdev(v) / mu))
        return 1.0 - cv

    stability = 0.5 * stab(b) + 0.5 * stab(c)
    score = max(0.0, min(1.0, 0.6 * continuity + 0.4 * stability))
    return round(score, 3)
