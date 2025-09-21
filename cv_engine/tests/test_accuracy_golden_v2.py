import math

from cv_engine.calibration.simple import measure_from_tracks
from cv_engine.metrics.kinematics import CalibrationParams


def _ballistic_tracks(v0_mps, launch_deg, fps, m_per_px, n=40):
    dt = 1.0 / fps
    g = 9.81
    th = math.radians(launch_deg)
    vx, vy = v0_mps * math.cos(th), v0_mps * math.sin(th)
    pts_px = []
    for i in range(n):
        t = i * dt
        x = vx * t
        y = vy * t - 0.5 * g * t * t
        if y < 0 and i > 1:
            break
        pts_px.append((x / m_per_px, 100 - y / m_per_px))
    return pts_px


def _expected_carry_no_drag(v0, launch_deg):
    return (v0 * v0 * math.sin(math.radians(2 * launch_deg))) / 9.81


def test_golden_high_launch_mid_speed():
    fps = 240.0
    mpp = 1 / 120
    calib = CalibrationParams.from_reference(1.0, 120.0, fps)
    v0 = 55.0
    launch = 20.0
    ball = _ballistic_tracks(v0, launch, fps, mpp, n=60)
    club = [(i * 1.5, 110) for i in range(len(ball))]
    m = measure_from_tracks(ball, club, calib)
    assert abs(m.ball_speed_mps - v0) <= 1.0
    assert abs(m.launch_deg - launch) <= 1.2
    exp = _expected_carry_no_drag(v0, launch)
    assert abs(m.carry_m - exp) <= 6.0


def test_golden_low_launch_high_speed_short_track():
    fps = 120.0
    mpp = 1 / 100
    calib = CalibrationParams.from_reference(1.0, 100.0, fps)
    v0 = 60.0
    launch = 5.0
    ball = _ballistic_tracks(v0, launch, fps, mpp, n=10)
    club = [(i * 1.5, 110) for i in range(len(ball))]
    m = measure_from_tracks(ball, club, calib)
    assert abs(m.ball_speed_mps - v0) <= 1.5
    assert abs(m.launch_deg - launch) <= 1.5
    exp = _expected_carry_no_drag(v0, launch)
    assert abs(m.carry_m - exp) <= 8.0
