import math

from cv_engine.calibration.simple import measure_from_tracks
from cv_engine.metrics.kinematics import (
    CalibrationParams,
    sliding_speed_series,
    sliding_window_velocity,
    velocity_avg,
)


def _two_point(track, fps, m_per_px):
    if len(track) < 2:
        return (0.0, 0.0)
    (x1, y1), (x2, y2) = track[0], track[1]
    dx = (x2 - x1) * m_per_px
    dy = (y2 - y1) * m_per_px
    return dx * fps, -dy * fps


def test_velocity_avg_reduces_error_with_noise():
    fps = 120.0
    m_per_px = 0.01
    vx_true = 5.0
    vy_true = 2.0
    frames = 10
    dx_px = vx_true / (fps * m_per_px)
    dy_px = vy_true / (fps * m_per_px)

    track = []
    for i in range(frames):
        noise_x = (-1) ** i * 0.3
        noise_y = (-1) ** (i + 1) * 0.4
        x = 50 + i * dx_px + noise_x
        y = 40 - i * dy_px + noise_y
        track.append((x, y))

    vx_avg, vy_avg = velocity_avg(track, fps, m_per_px)
    vx_two, vy_two = _two_point(track, fps, m_per_px)

    err_avg = math.hypot(vx_avg - vx_true, vy_avg - vy_true)
    err_two = math.hypot(vx_two - vx_true, vy_two - vy_true)

    assert err_avg <= err_two + 1e-6


def test_velocity_avg_matches_two_point_for_short_tracks():
    fps = 120.0
    m_per_px = 0.01
    track = [(0.0, 0.0), (1.0, 1.0)]
    assert velocity_avg(track[:1], fps, m_per_px) == (0.0, 0.0)
    assert velocity_avg(track, fps, m_per_px) == _two_point(track, fps, m_per_px)


def test_sliding_window_velocity_improves_noise_resilience():
    fps = 240.0
    m_per_px = 0.008
    vx_true = 20.0
    vy_true = 0.0
    frames = 15
    dx_px = vx_true / (fps * m_per_px)

    track = []
    for i in range(frames):
        noise = (-1) ** i * 0.6
        x = 5 + i * dx_px + noise
        y = 10 + (0.5 if i % 3 == 0 else -0.3)
        track.append((x, y))

    velocities = sliding_window_velocity(track, fps, m_per_px, window=4)
    speeds = [math.hypot(vx, vy) for vx, vy in velocities]

    assert len(speeds) == frames - 4
    assert all(abs(speed - vx_true) < 1.5 for speed in speeds)


def test_sliding_series_exposed_in_metrics_dataclass():
    fps = 120.0
    m_per_px = 0.01
    calib = CalibrationParams(m_per_px=m_per_px, fps=fps)
    ball_track = [(i * 2.0, 100.0 - i * 0.5) for i in range(8)]
    club_track = [(i * 1.2, 110.0 - i * 0.2) for i in range(8)]

    metrics = measure_from_tracks(ball_track, club_track, calib)

    ball_series = sliding_speed_series(ball_track, fps, m_per_px, window=3)
    club_series = sliding_speed_series(club_track, fps, m_per_px, window=3)

    assert metrics.ball_speed_window_mps == tuple(ball_series)
    assert metrics.club_speed_window_mps == tuple(club_series)
    if club_series:
        assert metrics.club_speed_trend_pct == (club_series[-1] - club_series[0]) / club_series[0] * 100.0
