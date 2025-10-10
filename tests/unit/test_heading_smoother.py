from __future__ import annotations

import math

import pytest

from arhud.smoothing import HeadingSmoother


def test_heading_mean_and_rms_stability() -> None:
    smoother = HeadingSmoother(window_seconds=3.0)
    smoother.update(10.0, dt=1.0)
    smoother.update(12.0, dt=1.0)
    smoother.update(11.0, dt=1.0)
    assert smoother.mean() == pytest.approx(11.0, rel=1e-3)
    assert smoother.rms() == pytest.approx(math.sqrt(2 / 3), rel=1e-3)


def test_wraparound_handling() -> None:
    smoother = HeadingSmoother(window_seconds=2.0)
    smoother.update(350.0, dt=1.0)
    smoother.update(10.0, dt=1.0)
    mean = smoother.mean()
    assert -20.0 < mean < 20.0
    assert smoother.rms() < 15.0


def test_zero_window_rejection() -> None:
    try:
        HeadingSmoother(window_seconds=0.0)
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for zero window")


def test_non_monotonic_dt_guard() -> None:
    smoother = HeadingSmoother(window_seconds=2.0)
    smoother.update(0.0, dt=0.5)
    try:
        smoother.update(1.0, dt=-0.1)
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for negative dt")
