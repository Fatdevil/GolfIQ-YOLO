from __future__ import annotations

import pytest

from server.courses.hole_detect import (
    HoleSuggestion,
    suggest_hole,
)
from server.courses.schemas import CourseBundle, GeoPoint, GreenFMB, HoleBundle


def build_fake_bundle() -> CourseBundle:
    return CourseBundle(
        id="test-course",
        name="Test Course",
        country="SE",
        holes=[
            HoleBundle(
                number=1,
                par=4,
                tee_center=GeoPoint(lat=0.0, lon=0.0),
                green=GreenFMB(
                    front=GeoPoint(lat=0.0, lon=0.0009),
                    middle=GeoPoint(lat=0.0, lon=0.0010),
                    back=GeoPoint(lat=0.0, lon=0.0011),
                ),
            ),
            HoleBundle(
                number=2,
                par=4,
                tee_center=GeoPoint(lat=0.0, lon=0.0025),
                green=GreenFMB(
                    front=GeoPoint(lat=0.0, lon=0.0034),
                    middle=GeoPoint(lat=0.0, lon=0.0035),
                    back=GeoPoint(lat=0.0, lon=0.0036),
                ),
            ),
            HoleBundle(
                number=3,
                par=3,
                tee_center=GeoPoint(lat=0.0, lon=0.0045),
                green=GreenFMB(
                    front=GeoPoint(lat=0.0, lon=0.0054),
                    middle=GeoPoint(lat=0.0, lon=0.0055),
                    back=GeoPoint(lat=0.0, lon=0.0056),
                ),
            ),
        ],
    )


@pytest.fixture()
def fake_bundle() -> CourseBundle:
    return build_fake_bundle()


def test_suggests_closest_tee(fake_bundle: CourseBundle) -> None:
    suggestion = suggest_hole(fake_bundle, lat=0.0, lon=0.0)

    assert isinstance(suggestion, HoleSuggestion)
    assert suggestion.hole == 1
    assert suggestion.reason == "closest_tee"
    assert suggestion.confidence >= 0.8


def test_suggests_closest_green(fake_bundle: CourseBundle) -> None:
    suggestion = suggest_hole(fake_bundle, lat=0.0, lon=0.0035)

    assert isinstance(suggestion, HoleSuggestion)
    assert suggestion.hole == 2
    assert suggestion.reason == "closest_green"
    assert suggestion.confidence >= 0.8


def test_suggests_between_green_and_next_tee(fake_bundle: CourseBundle) -> None:
    suggestion = suggest_hole(
        fake_bundle,
        lat=0.0,
        lon=0.00185,
        current_hole=1,
    )

    assert isinstance(suggestion, HoleSuggestion)
    assert suggestion.hole == 2
    assert suggestion.reason == "between_green_and_next_tee"
    assert suggestion.confidence >= 0.7


def test_returns_none_when_far_away(fake_bundle: CourseBundle) -> None:
    suggestion = suggest_hole(fake_bundle, lat=1.0, lon=1.0)

    assert suggestion is None
