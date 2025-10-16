from __future__ import annotations

from scripts import _rdp


def test_rdp_reduces_points_for_nearly_linear_path() -> None:
    path = [
        (-122.0, 37.0),
        (-122.0005, 37.0002),
        (-122.0009, 37.0004),
        (-122.0012, 37.0006),
        (-122.0020, 37.0010),
    ]
    simplified = _rdp.rdp_simplify(path, epsilon=10.0)
    assert simplified[0] == path[0]
    assert simplified[-1] == path[-1]
    assert len(simplified) < len(path)


def test_rdp_zero_tolerance_keeps_points() -> None:
    path = [(-122.0, 37.0), (-122.001, 37.001), (-122.002, 37.002)]
    simplified = _rdp.rdp_simplify(path, epsilon=0.0)
    assert simplified == path
