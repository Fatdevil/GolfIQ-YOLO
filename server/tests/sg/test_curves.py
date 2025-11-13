import math

import pytest

from server.sg.curves import CURVES, expected_strokes


@pytest.mark.parametrize("lie", list(CURVES.keys()))
def test_expected_strokes_monotonic(lie: str) -> None:
    distances = [point[0] for point in CURVES[lie]]
    samples = [expected_strokes(d, lie) for d in distances]
    assert samples == pytest.approx(sorted(samples))

    for a, b in zip(distances, distances[1:]):
        mid = (a + b) / 2
        assert expected_strokes(mid, lie) >= samples[0]


def test_expected_strokes_green_reasonable() -> None:
    two_m_putt = expected_strokes(2.0, "green")
    assert 1.2 <= two_m_putt <= 1.4

    tap_in = expected_strokes(0.5, "green")
    assert tap_in >= 1.0
    assert tap_in <= two_m_putt


def test_expected_strokes_fallback_and_tail() -> None:
    baseline = expected_strokes(150.0, "fairway")
    fallback = expected_strokes(150.0, "unknown")
    assert baseline == pytest.approx(fallback)

    max_point = CURVES["tee"][-1][0]
    tail_value = expected_strokes(max_point + 50.0, "tee")
    cap_value = expected_strokes(max_point, "tee")
    assert tail_value > cap_value
    assert tail_value - cap_value < math.log1p(50.0)


def test_zero_distance_returns_zero() -> None:
    assert expected_strokes(0.0, "green") == 0.0
    assert expected_strokes(-10.0, "fairway") == 0.0
