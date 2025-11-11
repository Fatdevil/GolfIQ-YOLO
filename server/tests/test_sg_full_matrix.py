from __future__ import annotations

import pytest

from server.services import sg
from server.services.sg import expected_strokes, sg_delta


@pytest.mark.parametrize("lie", ["tee", "fairway", "rough", "sand", "green"])
@pytest.mark.parametrize("dist", [0.5, 2, 5, 15, 40, 90, 160, 230])
def test_expected_monotonic_and_nonnegative(lie: str, dist: float) -> None:
    first = expected_strokes(dist, lie)
    second = expected_strokes(dist * 1.25, lie)

    assert first >= 0
    assert second >= first


def test_negative_and_huge_distances_are_clamped() -> None:
    assert expected_strokes(-10, "fairway") >= 0
    assert expected_strokes(1e6, "tee") >= 0


def test_sg_progress_and_holeout_paths() -> None:
    assert sg_delta(30.0, 10.0, strokes_used=1, lie_start="fairway") >= 0.0
    assert sg_delta(2.5, None, strokes_used=1, lie_start="green") >= 0.0


def test_interpolate_requires_points() -> None:
    with pytest.raises(ValueError):
        sg._interpolate(5.0, [])


def test_sg_delta_rejects_negative_strokes() -> None:
    with pytest.raises(ValueError):
        sg.sg_delta(10.0, 5.0, strokes_used=-1)


def test_interpolate_edge_cases_with_mocked_bisect(monkeypatch) -> None:
    original = sg.bisect_left

    def fake_zero(distances: list[float], value: float) -> int:
        return 0

    monkeypatch.setattr(sg, "bisect_left", fake_zero)
    assert sg._interpolate(6.0, [(5.0, 2.0), (10.0, 4.0)]) == 2.0

    def fake_duplicate(distances: list[float], value: float) -> int:
        return 2

    table = [(0.0, 1.0), (5.0, 2.0), (5.0, 3.0), (10.0, 4.0)]
    monkeypatch.setattr(sg, "bisect_left", fake_duplicate)
    assert sg._interpolate(6.0, table) == 3.0

    monkeypatch.setattr(sg, "bisect_left", original)
