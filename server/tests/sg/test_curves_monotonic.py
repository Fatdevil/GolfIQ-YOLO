"""Tests for expected strokes curves monotonicity and clamping."""

from __future__ import annotations

import pytest

from server.sg.curves import CURVES, expected_strokes


@pytest.mark.parametrize("lie, points", CURVES.items())
def test_monotonic_interpolation(lie: str, points):
    distances = [p[0] for p in points]
    # Sample midpoints to ensure interpolation does not decrease
    samples = list(distances)
    samples += [(a + b) / 2 for a, b in zip(distances, distances[1:])]
    samples = sorted(set(samples))

    for d1, d2 in zip(samples, samples[1:]):
        val1 = expected_strokes(d1, lie)
        val2 = expected_strokes(
            d2 + 1e-9, lie
        )  # nudge to ensure strictly greater distance
        assert val2 >= val1 - 1e-9


@pytest.mark.parametrize("lie", CURVES.keys())
def test_clamping_behavior(lie: str):
    min_distance = CURVES[lie][0][0]
    max_distance = CURVES[lie][-1][0]
    assert expected_strokes(-10, lie) == 0.0
    assert expected_strokes(0, lie) == 0.0

    if min_distance > 0:
        probe = min_distance / 2
        assert expected_strokes(probe, lie) == CURVES[lie][0][1]
    else:
        second_distance, second_value = CURVES[lie][1]
        probe = second_distance / 2
        probe_value = expected_strokes(probe, lie)
        first_value = CURVES[lie][0][1]
        assert first_value <= probe_value <= second_value

    assert expected_strokes(max_distance * 2, lie) == CURVES[lie][-1][1]
