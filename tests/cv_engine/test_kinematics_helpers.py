from __future__ import annotations

from cv_engine.metrics.kinematics import (
    clamp_velocity_outliers,
    velocity_avg,
    windowed_velocity_samples,
)


def test_windowed_velocity_samples_skip_missing() -> None:
    points = [(0.0, 0.0), None, (10.0, 0.0), (20.0, 0.0)]
    samples = windowed_velocity_samples(points, fps=100.0, m_per_px=0.01, window=2)
    assert samples, "expected velocity samples"
    first_vx, first_vy = samples[0]
    assert abs(first_vx - 5.0) < 1e-3
    assert abs(first_vy) < 1e-6


def test_clamp_velocity_outliers_limits_extremes() -> None:
    samples = [(5.0, 0.2), (5.2, 0.1), (40.0, 12.0)]
    clamped = clamp_velocity_outliers(samples)
    assert max(vx for vx, _ in clamped) < 15.0
    assert max(abs(vy) for _, vy in clamped) < 5.0


def test_velocity_avg_handles_short_tracks() -> None:
    # With only a couple of points velocity should be derived from sliding window.
    points = [(0.0, 0.0), (5.0, -5.0), (10.0, -10.0)]
    vx, vy = velocity_avg(points, fps=50.0, m_per_px=0.02)
    assert vx > 0
    assert vy > 0  # inverted axis makes upward motion positive
