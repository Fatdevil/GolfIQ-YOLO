"""Unit tests for watch HUD service integration with course bundles and caddie."""

from __future__ import annotations

from typing import Optional

import pytest

from server.caddie.schemas import AdviseOut
from server.courses.schemas import CourseBundle, GeoPoint, GreenFMB, HoleBundle
from server.watch import hud_service


class _DummyRun:
    def __init__(self, *, event_id: str = "evt-1", course_id: str = "course-1") -> None:
        self.params = {"eventId": event_id, "courseId": course_id}
        self.metrics = {"shotsTaken": 1}
        self.events = [101]


@pytest.fixture
def sample_bundle() -> CourseBundle:
    return CourseBundle(
        id="course-1",
        name="Sample",
        country="USA",
        holes=[
            HoleBundle(
                number=1,
                par=4,
                tee_center=GeoPoint(lat=37.0, lon=-122.0),
                green=GreenFMB(
                    front=GeoPoint(lat=37.0005, lon=-121.9995),
                    middle=GeoPoint(lat=37.0007, lon=-121.9993),
                    back=GeoPoint(lat=37.0009, lon=-121.9990),
                ),
            ),
            HoleBundle(
                number=2,
                par=3,
                tee_center=GeoPoint(lat=37.0010, lon=-121.9988),
                green=GreenFMB(
                    front=GeoPoint(lat=37.0015, lon=-121.9983),
                    middle=GeoPoint(lat=37.0017, lon=-121.9981),
                    back=GeoPoint(lat=37.0019, lon=-121.9978),
                ),
            ),
        ],
    )


def test_compute_green_distances_returns_expected_values(
    sample_bundle: CourseBundle,
) -> None:
    position = GeoPoint(lat=37.0016, lon=-121.9982)
    to_green, to_front, to_back = hud_service._compute_green_distances(
        sample_bundle, 2, position
    )
    assert to_green is not None
    assert to_front is not None
    assert to_back is not None
    assert to_front < to_back  # front should be closer than back from the approach side


def test_build_hole_hud_with_bundle_and_caddie(
    sample_bundle: CourseBundle, monkeypatch: pytest.MonkeyPatch
) -> None:
    dummy_run = _DummyRun()

    def fake_get_course_bundle(course_id: str) -> Optional[CourseBundle]:
        assert course_id == sample_bundle.id
        return sample_bundle

    monkeypatch.setattr(hud_service, "get_course_bundle", fake_get_course_bundle)
    monkeypatch.setattr(hud_service, "load_run", lambda run_id: dummy_run)
    monkeypatch.setattr(
        hud_service,
        "suggest_hole",
        lambda bundle, lat, lon, current_hole=None: type(
            "Suggestion", (), {"hole": 2, "confidence": 0.9}
        )(),
    )
    monkeypatch.setattr(
        hud_service, "get_latest_tip_for_member", lambda member_id: None
    )
    monkeypatch.setattr(
        hud_service,
        "advise",
        lambda advise_in: AdviseOut(
            playsLike_m=142.0,
            confidence=0.82,
            silent=False,
            silent_reason=None,
        ),
    )

    gnss = GeoPoint(lat=37.0016, lon=-121.9982)
    hud = hud_service.build_hole_hud(
        member_id="mem-1",
        run_id="run-1",
        hole=1,
        course_id=None,
        gnss=gnss,
        wind_mps=4.5,
        wind_dir_deg=320.0,
        temp_c=19.0,
        plan="pro",
    )

    assert hud.hole == 2  # auto-hole adjustment applied
    assert hud.plan == "pro"
    assert hud.courseId == sample_bundle.id
    assert hud.eventId == "evt-1"
    assert hud.toGreen_m is not None and hud.toGreen_m > 0
    assert hud.par == 3
    assert hud.playsLike_m == pytest.approx(142.0)
    assert hud.caddie_confidence == pytest.approx(0.82)
    assert hud.caddie_silent is False
    assert hud.caddie_silent_reason is None
    assert hud.wind_mps == 4.5
    assert hud.wind_dir_deg == 320.0
    assert hud.temp_c == 19.0
    assert hud.shotsTaken == 1
