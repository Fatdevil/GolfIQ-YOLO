from __future__ import annotations

import math

import pytest

from server.routes.health_utils import safe_delta, safe_rate


@pytest.mark.parametrize(
    "hits,samples,expected",
    [
        (0, 0, 0.0),
        (1, 0, 0.0),
        (3, 10, 0.3),
        (5, -2, 0.0),
        ("abc", 10, 0.0),
        (2, "bad", 0.0),
    ],
)
def test_safe_rate(hits, samples, expected):
    assert safe_rate(hits, samples) == pytest.approx(expected, abs=1e-12)


@pytest.mark.parametrize(
    "curr,prev,bound,expected",
    [
        (None, 1.0, 0.25, 0.0),
        (1.0, None, 0.25, 0.0),
        (1.1, 1.0, 0.25, 0.1),
        (2.0, 1.0, 0.25, 0.25),
        (-0.5, 0.1, 0.25, -0.25),
        (math.nan, 0.0, 0.25, 0.0),
        (0.2, math.nan, 0.25, 0.0),
        (float("inf"), 0.0, 0.25, 0.0),
        (1e308, -1e308, 0.25, 0.0),
        (0.5, 0.1, None, 0.4),
    ],
)
def test_safe_delta(curr, prev, bound, expected):
    assert safe_delta(curr, prev, bound) == pytest.approx(expected, abs=1e-12)
