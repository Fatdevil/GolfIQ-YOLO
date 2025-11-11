from __future__ import annotations

import pytest

from server.services.sg import expected_strokes, sg_delta


@pytest.mark.parametrize(
    "dist, lie",
    [
        (2.0, "green"),
        (10.0, "fairway"),
        (80.0, "rough"),
        (150.0, "tee"),
        (25.0, "sand"),
    ],
)
def test_expected_strokes_monotonic(dist: float, lie: str) -> None:
    shorter = expected_strokes(dist, lie)
    longer = expected_strokes(dist * 1.5, lie)
    assert shorter >= 0.0
    assert longer >= 0.0
    assert longer >= shorter


def test_negative_distance_is_clamped() -> None:
    assert expected_strokes(-5.0, "fairway") >= 0.0


def test_sg_holeout_and_progress_positive() -> None:
    holeout = sg_delta(3.0, None, strokes_used=1, lie_start="green")
    progress = sg_delta(30.0, 10.0, strokes_used=1, lie_start="fairway")
    assert holeout > 0.0
    assert progress >= 0.0
