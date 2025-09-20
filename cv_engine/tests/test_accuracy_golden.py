import math

from cv_engine.calibration.simple import measure_from_tracks
from cv_engine.metrics.kinematics import CalibrationParams


def _ballistic_tracks(v0_mps, launch_deg, fps, m_per_px, n=20):
    # generera en ideal 2D-bana i meter → konvertera till px
    dt = 1.0 / fps
    g = 9.81
    theta = math.radians(launch_deg)
    vx, vy = v0_mps * math.cos(theta), v0_mps * math.sin(theta)
    pts_m = []
    x = y = 0.0
    for i in range(n):
        t = i * dt
        x = vx * t
        y = vy * t - 0.5 * g * t * t
        if y < 0 and i > 1:
            break
        pts_m.append((x, y))
    # m→px (y nedåt i bild ⇒ invert senare i kinematiken redan)
    pts_px = [(xm / m_per_px, 100 - ym / m_per_px) for (xm, ym) in pts_m]
    return pts_px


def test_golden_medium_speed_low_launch():
    fps = 120.0
    m_per_px = 1.0 / 100.0
    calib = CalibrationParams.from_reference(1.0, 100.0, fps)
    # sanna värden
    v0 = 40.0
    launch = 12.0
    ball = _ballistic_tracks(v0, launch, fps, m_per_px, n=30)
    club = [(i * 1.5, 110) for i in range(len(ball))]
    m = measure_from_tracks(ball, club, calib)
    # toleranser
    assert abs(m.ball_speed_mps - v0) <= 1.0  # ±1 m/s
    assert abs(m.launch_deg - launch) <= 1.5  # ±1.5°
    # Carry-approx utan luft: v^2 sin(2θ)/g
    expected_carry = (v0 * v0 * math.sin(math.radians(2 * launch))) / 9.81
    assert abs(m.carry_m - expected_carry) <= 5.0  # ±5 m
