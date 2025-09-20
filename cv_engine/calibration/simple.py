from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Tuple

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
    ball_track = list(ball)
    club_track = list(club)

    ball_vx, ball_vy_avg = _velocity(ball_track, calib)
    club_vx, club_vy = _velocity(club_track, calib)

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
    )


def as_dict(m: KinematicMetrics) -> dict:
    return {
        "ball_speed_mps": m.ball_speed_mps,
        "ball_speed_mph": m.ball_speed_mph,
        "club_speed_mps": m.club_speed_mps,
        "club_speed_mph": m.club_speed_mph,
        "launch_deg": m.launch_deg,
        "carry_m": m.carry_m,
    }
