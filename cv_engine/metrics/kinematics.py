from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Iterable, List, Sequence, Tuple


@dataclass
class CalibrationParams:
    """Simple calibration data for kinematics computations."""

    m_per_px: float
    fps: float

    @classmethod
    def from_reference(
        cls, ref_len_m: float, ref_len_px: float, fps: float
    ) -> "CalibrationParams":
        return cls(m_per_px=ref_len_m / ref_len_px, fps=fps)


Point = Tuple[float, float]


def _two_point_velocity(
    positions_px: Sequence[Point], fps: float, m_per_px: float
) -> Tuple[float, float]:
    if len(positions_px) < 2:
        return 0.0, 0.0
    (x1, y1), (x2, y2) = positions_px[0], positions_px[1]
    dx = (x2 - x1) * m_per_px
    dy = (y2 - y1) * m_per_px
    dy = -dy
    vx = dx * fps
    vy = dy * fps
    return vx, vy


def velocity_avg(
    positions_px: Iterable[Point], fps: float, m_per_px: float
) -> Tuple[float, float]:
    """Compute average velocity across a track."""

    pts = list(positions_px)
    if len(pts) < 3:
        return _two_point_velocity(pts, fps, m_per_px)

    vx_total = 0.0
    vy_total = 0.0
    steps = 0
    for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
        dx = (x2 - x1) * m_per_px
        dy = (y2 - y1) * m_per_px
        dy = -dy
        vx_total += dx * fps
        vy_total += dy * fps
        steps += 1

    if steps == 0:
        return 0.0, 0.0

    return vx_total / steps, vy_total / steps


def sliding_window_velocity(
    positions_px: Sequence[Point],
    fps: float,
    m_per_px: float,
    *,
    window: int = 3,
) -> List[Tuple[float, float]]:
    """Return per-window velocity vectors (Δs/Δt) over a sliding horizon.

    The helper intentionally smooths noise for short ball/club tracks so we
    can keep ball speed within ±3% and monitor club speed trend within ±5%.
    """

    if fps <= 0 or m_per_px <= 0:
        return []

    pts = list(positions_px)
    if len(pts) < 2:
        return []

    horizon = max(1, window)
    velocities: List[Tuple[float, float]] = []
    for idx in range(horizon, len(pts)):
        prev = pts[idx - horizon]
        curr = pts[idx]
        span = idx - (idx - horizon)
        if span <= 0:
            continue
        dt = span / fps
        if dt <= 0:
            continue
        dx = (curr[0] - prev[0]) * m_per_px
        dy = (curr[1] - prev[1]) * m_per_px
        vx = dx / dt
        vy = -(dy / dt)
        velocities.append((vx, vy))

    return velocities


def sliding_speed_series(
    positions_px: Sequence[Point],
    fps: float,
    m_per_px: float,
    *,
    window: int = 3,
) -> List[float]:
    """Compute smoothed speed magnitudes for monitoring."""

    return [
        math.hypot(vx, vy)
        for vx, vy in sliding_window_velocity(
            positions_px, fps, m_per_px, window=window
        )
    ]
