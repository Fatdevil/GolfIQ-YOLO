from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Tuple

from cv_engine.metrics.kinematics import CalibrationParams, velocity_avg


@dataclass
class KinematicMetrics:
    ball_speed_mps: float
    ball_speed_mph: float
    club_speed_mps: float
    club_speed_mph: float
    launch_deg: float
    carry_m: float


def _velocity(
    track: Iterable[Tuple[float, float]], calib: CalibrationParams
) -> Tuple[float, float]:
    """Compute velocity components (vx, vy) in m/s from a track."""
    return velocity_avg(track, calib.fps, calib.m_per_px)


def measure_from_tracks(ball, club, calib: CalibrationParams) -> KinematicMetrics:
    """Measure simple kinematic metrics from ball and club tracks."""
    ball_vx, ball_vy = _velocity(ball, calib)
    club_vx, club_vy = _velocity(club, calib)

    ball_speed = math.hypot(ball_vx, ball_vy)
    club_speed = math.hypot(club_vx, club_vy)

    launch_deg = math.degrees(math.atan2(ball_vy, ball_vx)) if ball_speed else 0.0
    g = 9.81
    carry = max(ball_vx * (2 * ball_vy / g), 0.0)

    return KinematicMetrics(
        ball_speed_mps=ball_speed,
        ball_speed_mph=ball_speed * 2.23694,
        club_speed_mps=club_speed,
        club_speed_mph=club_speed * 2.23694,
        launch_deg=launch_deg,
        carry_m=carry,
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
