import pytest

from server.bundles.models import CourseBundle, CourseHole
from server.services.hole_detect import SuggestedHole, suggest_hole_for_location


@pytest.fixture
def hero_bundle() -> CourseBundle:
    return CourseBundle(
        id="hero-1",
        name="Hero Test",
        holes=[
            CourseHole(
                hole=1,
                par=4,
                polyline=[(0.0, 0.0), (0.0001, 0.0)],
                green_center=(0.0, 0.0),
            ),
            CourseHole(
                hole=2,
                par=3,
                polyline=[(0.0005, 0.0), (0.0006, 0.0)],
                green_center=(0.0006, 0.0),
            ),
            CourseHole(
                hole=3,
                par=5,
                polyline=[(0.0012, 0.0), (0.0013, 0.0)],
                green_center=(0.0013, 0.0),
            ),
        ],
    )


def test_suggest_hole_prefers_nearest_green(hero_bundle: CourseBundle) -> None:
    suggestion = suggest_hole_for_location(
        bundle=hero_bundle,
        lat=0.0,
        lon=0.00005,
    )
    assert suggestion is not None
    assert isinstance(suggestion, SuggestedHole)
    assert suggestion.hole == 1
    assert suggestion.reason == "nearest_green"
    assert suggestion.distance_m > 0
    assert suggestion.confidence > 0.9


def test_suggest_hole_biases_toward_next_hole(hero_bundle: CourseBundle) -> None:
    suggestion = suggest_hole_for_location(
        bundle=hero_bundle,
        lat=0.0,
        lon=0.0003,
        last_hole=1,
    )
    assert suggestion is not None
    assert suggestion.hole == 2
    assert suggestion.reason == "nearest_next_hole"
    assert suggestion.confidence > 0.6


def test_suggest_hole_returns_none_when_far(hero_bundle: CourseBundle) -> None:
    suggestion = suggest_hole_for_location(
        bundle=hero_bundle,
        lat=0.1,
        lon=0.1,
    )
    assert suggestion is None
