from __future__ import annotations

import math

import pytest

from scripts import _geo


def test_haversine_matches_equatorial_distance() -> None:
    start = (0.0, 0.0)
    end = (0.0, 0.001)  # ~111 m at the equator
    distance = _geo.haversine_meters(start, end)
    assert distance == pytest.approx(111.195, rel=1e-3)


def test_polygon_area_and_bbox_estimation() -> None:
    square = [
        [
            (0.0, 0.0),
            (0.0, 0.00001),
            (0.00001, 0.00001),
            (0.00001, 0.0),
            (0.0, 0.0),
        ]
    ]
    area = _geo.polygon_area_sq_m(square)
    # Each side is roughly 1.11 m, so the square is a little over 1 m²
    assert area == pytest.approx(1.23, rel=0.1)

    bbox = _geo.compute_bbox_from_coordinates(square)
    assert bbox == [0.0, 0.0, 0.00001, 0.00001]


def test_linestring_length_and_quantisation() -> None:
    points = [(0.0, 0.0), (0.00003, 0.00003)]
    length = _geo.linestring_length_m(points)
    assert length > 0

    quantised = _geo.quantize_coordinates(points, quantum=1e-5)
    for lon, lat in quantised:
        for value in (lon, lat):
            steps = round(value / 1e-5)
            assert math.isclose(value, steps * 1e-5, rel_tol=0.0, abs_tol=1e-9)
