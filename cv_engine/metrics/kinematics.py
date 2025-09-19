from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence, Tuple


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
