from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Sequence, Tuple

from cv_engine.metrics.kinematics import (
    CalibrationParams,
    sliding_speed_series,
    velocity_avg,
)


@dataclass
class KinematicMetrics:
    ball_speed_mps: float
    ball_speed_mph: float
    club_speed_mps: float
    club_speed_mph: float
    launch_deg: float
    carry_m: float
    ball_speed_window_mps: Tuple[float, ...] = field(default_factory=tuple)
    club_speed_window_mps: Tuple[float, ...] = field(default_factory=tuple)
    club_speed_trend_pct: float = 0.0


def _velocity(
    track: Iterable[Tuple[float, float]], calib: CalibrationParams
) -> Tuple[float, float]:
    """Compute velocity components (vx, vy) in m/s from a track."""
    return velocity_avg(track, calib.fps, calib.m_per_px)


def _trend_percent(series: Sequence[float]) -> float:
    if len(series) < 2:
        return 0.0
    start = series[0]
    end = series[-1]
    if abs(start) < 1e-6:
        return 0.0
    return (end - start) / start * 100.0


def measure_from_tracks(ball, club, calib: CalibrationParams) -> KinematicMetrics:
    """Measure simple kinematic metrics from ball and club tracks."""
    ball_track = list(ball)
    club_track = list(club)

    ball_vx, ball_vy_avg = _velocity(ball_track, calib)
    club_vx, club_vy = _velocity(club_track, calib)

    ball_speed_samples = tuple(
        sliding_speed_series(ball_track, calib.fps, calib.m_per_px, window=3)
    )
    club_speed_samples = tuple(
        sliding_speed_series(club_track, calib.fps, calib.m_per_px, window=3)
    )

    g = 9.81
    ball_steps = max(len(ball_track) - 1, 0)
    duration_s = ball_steps / calib.fps if calib.fps else 0.0
    ball_vy = ball_vy_avg + 0.5 * g * duration_s

    ball_speed = math.hypot(ball_vx, ball_vy)
    club_speed = math.hypot(club_vx, club_vy)

    launch_deg = math.degrees(math.atan2(ball_vy, ball_vx)) if ball_speed else 0.0
    carry = max(ball_vx * (2 * ball_vy / g), 0.0)

    return KinematicMetrics(
        ball_speed_mps=ball_speed,
        ball_speed_mph=ball_speed * 2.23694,
        club_speed_mps=club_speed,
        club_speed_mph=club_speed * 2.23694,
        launch_deg=launch_deg,
        carry_m=carry,
        ball_speed_window_mps=ball_speed_samples,
        club_speed_window_mps=club_speed_samples,
        club_speed_trend_pct=_trend_percent(club_speed_samples),
    )


def as_dict(
    m: KinematicMetrics, *, include_spin_placeholders: bool = True
) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "ball_speed_mps": round(m.ball_speed_mps, 2),
        "ball_speed_mph": round(m.ball_speed_mph, 1),
        "club_speed_mps": round(m.club_speed_mps, 2),
        "club_speed_mph": round(m.club_speed_mph, 1),
        "launch_deg": round(m.launch_deg, 1),
        "carry_m": round(m.carry_m, 1),
        "metrics_version": 1,
    }
    if include_spin_placeholders:
        out.setdefault("spin_rpm", None)
        out.setdefault("spin_axis_deg", None)
        out.setdefault("club_path_deg", None)
    return out
