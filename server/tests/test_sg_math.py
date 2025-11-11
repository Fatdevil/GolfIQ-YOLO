from __future__ import annotations

import math

from server.services import sg


def test_expected_strokes_monotonic() -> None:
    close = sg.expected_strokes(2.0, lie="green")
    mid = sg.expected_strokes(10.0, lie="green")
    far = sg.expected_strokes(25.0, lie="green")
    assert close < mid < far


def test_sg_delta_single_putt_positive() -> None:
    result = sg.sg_delta(120.0, 2.0, strokes_used=1, lie_start="fairway")
    expected = (
        sg.expected_strokes(120.0, "fairway") - sg.expected_strokes(2.0, "green") - 1.0
    )
    assert math.isclose(result, expected, rel_tol=1e-5)
    assert result > 0


def test_sg_delta_three_putt_negative() -> None:
    start = sg.expected_strokes(5.0, "green")
    result = sg.sg_delta(5.0, end_dist_m=0.5, strokes_used=3, lie_start="green")
    assert result < 0
    expected_end = sg.expected_strokes(0.5, "green")
    assert math.isclose(result, (start - expected_end) - 3.0, rel_tol=1e-6)
