from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Iterable, List, Optional, Sequence, Tuple


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


def _median_abs_dev(values: List[float], mid: float) -> float:
    if not values:
        return 0.0
    deviations = [abs(v - mid) for v in values]
    return float(median(deviations)) if deviations else 0.0


def windowed_velocity_samples(
    positions_px: Sequence[Optional[Point]],
    fps: float,
    m_per_px: float,
    window: int = 3,
) -> List[Tuple[float, float]]:
    """Return velocity samples using a sliding window with frame index gaps."""

    if fps <= 0 or m_per_px <= 0:
        return []

    indexed: List[Tuple[int, Point]] = [
        (idx, point) for idx, point in enumerate(positions_px) if point is not None
    ]
    if len(indexed) < 2:
        return []

    samples: List[Tuple[float, float]] = []
    window = max(1, int(window))
    for current_idx in range(1, len(indexed)):
        cur_frame, (cur_x, cur_y) = indexed[current_idx]
        base_idx = max(0, current_idx - window)
        base_frame, (base_x, base_y) = indexed[base_idx]
        frame_delta = cur_frame - base_frame
        if frame_delta <= 0:
            continue
        seconds = frame_delta / fps
        if seconds <= 0:
            continue
        dx = (cur_x - base_x) * m_per_px
        dy = (base_y - cur_y) * m_per_px  # invert image y-axis
        samples.append((dx / seconds, dy / seconds))
    return samples


def clamp_velocity_outliers(
    samples: Sequence[Tuple[float, float]],
    clamp_factor: float = 3.5,
    fallback_ratio: float = 0.25,
) -> List[Tuple[float, float]]:
    """Clamp extreme samples using median absolute deviation heuristics."""

    if not samples:
        return []

    xs = [vx for vx, _ in samples]
    ys = [vy for _, vy in samples]
    mid_x = float(median(xs))
    mid_y = float(median(ys))
    mad_x = _median_abs_dev(xs, mid_x)
    mad_y = _median_abs_dev(ys, mid_y)
    bound_x = max(mad_x * clamp_factor, abs(mid_x) * fallback_ratio, 1e-6)
    bound_y = max(mad_y * clamp_factor, abs(mid_y) * fallback_ratio, 1e-6)

    clamped: List[Tuple[float, float]] = []
    for vx, vy in samples:
        vx_clamped = max(mid_x - bound_x, min(mid_x + bound_x, vx))
        vy_clamped = max(mid_y - bound_y, min(mid_y + bound_y, vy))
        clamped.append((vx_clamped, vy_clamped))
    return clamped


def velocity_avg(
    positions_px: Iterable[Point | None], fps: float, m_per_px: float
) -> Tuple[float, float]:
    """Compute average velocity across a track."""

    pts: List[Point | None] = list(positions_px)
    samples = windowed_velocity_samples(pts, fps=fps, m_per_px=m_per_px)
    if not samples:
        return 0.0, 0.0

    refined = clamp_velocity_outliers(samples)
    if not refined:
        return 0.0, 0.0

    vx_total = sum(vx for vx, _ in refined)
    vy_total = sum(vy for _, vy in refined)
    count = len(refined)
    return vx_total / count, vy_total / count
