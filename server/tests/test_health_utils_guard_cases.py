import math

import pytest

from server.routes.health_utils import safe_rate, safe_delta


@pytest.mark.parametrize(
    "hits,samples,exp",
    [
        (0, 0, 0.0),
        (1, 0, 0.0),
        (3, 10, 0.3),
        (5, -2, 0.0),
    ],
)
def test_safe_rate_guards(hits, samples, exp):
    assert safe_rate(hits, samples) == pytest.approx(exp, abs=1e-12)


@pytest.mark.parametrize(
    "curr,prev,bound,exp",
    [
        (None, 1.0, 0.25, 0.0),
        (1.0, None, 0.25, 0.0),
        (1.1, 1.0, 0.25, 0.1),
        (2.0, 1.0, 0.25, 0.25),
        (-0.5, 0.1, 0.25, -0.25),
        (math.nan, 0.0, 0.25, 0.0),
        (math.inf, 0.0, 0.25, 0.0),
    ],
)
def test_safe_delta_guards(curr, prev, bound, exp):
    assert safe_delta(curr, prev, bound) == pytest.approx(exp, abs=1e-12)
