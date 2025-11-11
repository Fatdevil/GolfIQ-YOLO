from __future__ import annotations

import pytest

from server.services.sg import expected_strokes, sg_delta


def test_sg_holeout_positive_delta() -> None:
    expectation = expected_strokes(2.5, "green")
    delta = sg_delta(2.5, None, strokes_used=1, lie_start="green")
    assert delta == pytest.approx(expectation - 1.0, abs=1e-6)


def test_expected_strokes_clamps_invalid() -> None:
    assert expected_strokes(-5, "fairway") >= 0.0
