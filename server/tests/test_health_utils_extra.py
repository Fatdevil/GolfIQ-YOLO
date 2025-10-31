from __future__ import annotations

import math

import pytest

from server.routes.health_utils import safe_delta, safe_rate


def test_safe_rate_zero_and_negative_samples_are_guarded() -> None:
    assert safe_rate(10, 0) == 0.0
    assert safe_rate(10, -4) == 0.0


@pytest.mark.parametrize(
    "curr, prev",
    [
        (math.nan, 1.0),
        (1.0, math.nan),
        (float("inf"), 1.0),
        (1.0, float("inf")),
    ],
)
def test_safe_delta_rejects_non_finite_inputs(curr: float, prev: float) -> None:
    assert safe_delta(curr, prev) == 0.0


def test_safe_delta_overflow_is_clamped_to_zero() -> None:
    assert safe_delta(1e308, -1e308) == 0.0
