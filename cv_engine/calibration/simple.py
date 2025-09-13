from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Tuple

from cv_engine.metrics.kinematics import CalibrationParams


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
    points = list(track)
    if len(points) < 2:
        return 0.0, 0.0
    (x1, y1), (x2, y2) = points[0], points[1]
    dx = (x2 - x1) * calib.m_per_px
    dy = (y2 - y1) * calib.m_per_px
    dy = -dy  # invert because image y increases downward
    vx = dx * calib.fps
    vy = dy * calib.fps
    return vx, vy


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


def as_dict(m: KinematicMetrics) -> dict:
    return {
        "ball_speed_mps": m.ball_speed_mps,
        "ball_speed_mph": m.ball_speed_mph,
        "club_speed_mps": m.club_speed_mps,
        "club_speed_mph": m.club_speed_mph,
        "launch_deg": m.launch_deg,
        "carry_m": m.carry_m,
    }
