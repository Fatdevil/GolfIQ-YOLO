"""Sanity checks for shot-level strokes-gained calculations."""

from __future__ import annotations

import math

from server.sg.engine import shot_sg


def test_short_putt_holed_is_positive():
    delta = shot_sg(before_m=2.0, after_m=0.0, before_lie="green")
    assert 0.3 <= delta <= 0.6


def test_three_putt_is_negative():
    first = shot_sg(before_m=12.0, after_m=3.0, before_lie="green")
    second = shot_sg(before_m=3.0, after_m=1.5, before_lie="green")
    third = shot_sg(before_m=1.5, after_m=0.0, before_lie="green")
    total = first + second + third
    assert total < 0
    assert -1.5 < total < 0


def test_fairway_approach_positive():
    delta = shot_sg(before_m=150.0, after_m=5.0, before_lie="fairway")
    assert delta > 0


def test_penalty_reduces_delta():
    base = shot_sg(before_m=200.0, after_m=50.0, before_lie="tee")
    penalized = shot_sg(before_m=200.0, after_m=50.0, before_lie="tee", penalty="ob")
    assert math.isclose(penalized, base - 2.0, rel_tol=1e-9, abs_tol=1e-9)
