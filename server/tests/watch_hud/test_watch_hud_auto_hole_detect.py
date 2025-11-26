from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.bundles import geometry
from server.bundles.models import CourseBundle as HeroCourseBundle, CourseHole
from server.caddie.schemas import AdviseOut
from server.courses.schemas import CourseBundle, GeoPoint, GreenFMB, HoleBundle
from server.services.hole_detect import SuggestedHole
from server.watch import hud_service

client = TestClient(app, raise_server_exceptions=True)


class _DummyRun:
    def __init__(self, *, course_id: str) -> None:
        self.params = {"eventId": "evt-hero", "courseId": course_id}
        self.metrics = {"shotsTaken": 1}
        self.events = [1]


def _hero_bundle(course_id: str = "hero-course") -> HeroCourseBundle:
    return HeroCourseBundle(
        id=course_id,
        name="Hero Course",
        holes=[
            CourseHole(hole=1, par=4, polyline=[(37.0, -122.0), (37.0002, -122.0)]),
            CourseHole(
                hole=2,
                par=3,
                polyline=[(37.0004, -122.0), (37.0006, -122.0)],
                green_center=(37.0006, -122.0),
            ),
            CourseHole(hole=3, par=5, polyline=[(37.001, -122.0), (37.0012, -122.0)]),
        ],
    )


def _legacy_bundle(course_id: str = "hero-course") -> CourseBundle:
    return CourseBundle(
        id=course_id,
        name="Legacy",
        country="USA",
        holes=[
            HoleBundle(
                number=1,
                par=4,
                tee_center=GeoPoint(lat=37.0, lon=-122.0),
                green=GreenFMB(
                    front=GeoPoint(lat=37.0001, lon=-122.0),
                    middle=GeoPoint(lat=37.0002, lon=-122.0),
                    back=GeoPoint(lat=37.0003, lon=-122.0),
                ),
            ),
            HoleBundle(
                number=2,
                par=3,
                tee_center=GeoPoint(lat=37.0004, lon=-122.0),
                green=GreenFMB(
                    front=GeoPoint(lat=37.0005, lon=-122.0),
                    middle=GeoPoint(lat=37.0006, lon=-122.0),
                    back=GeoPoint(lat=37.0007, lon=-122.0),
                ),
            ),
        ],
    )


@pytest.fixture(autouse=True)
def _patch_tip_bus(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        hud_service, "get_latest_tip_for_member", lambda member_id: None
    )


@pytest.fixture
def _patch_hero_bundle(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _hero_bundle()
    monkeypatch.setattr(hud_service, "get_hero_bundle", lambda course_id: bundle)
    monkeypatch.setattr(geometry, "get_bundle", lambda course_id: bundle)


@pytest.fixture
def _patch_legacy_bundle(monkeypatch: pytest.MonkeyPatch) -> None:
    bundle = _legacy_bundle()
    monkeypatch.setattr(hud_service, "get_course_bundle", lambda course_id: bundle)
    monkeypatch.setattr(
        hud_service, "load_run", lambda run_id: _DummyRun(course_id=bundle.id)
    )


@pytest.fixture(autouse=True)
def _patch_advise(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        hud_service,
        "advise",
        lambda advise_in: AdviseOut(
            playsLike_m=150.0,
            confidence=0.75,
            silent=False,
            silent_reason=None,
        ),
    )


def test_watch_hud_uses_hero_auto_detect(
    _patch_hero_bundle: None, _patch_legacy_bundle: None
) -> None:
    response = client.post(
        "/api/watch/hud/hole",
        json={
            "memberId": "mem-hero",
            "runId": "run-hero",
            "hole": 1,
            "courseId": "hero-course",
            "lat": 37.00058,
            "lon": -122.0,
        },
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["hole"] == 2
    assert payload["toGreen_m"] is not None and payload["toGreen_m"] > 0
    assert payload["toFront_m"] is not None
    assert payload["toBack_m"] is not None


def test_watch_hud_respects_manual_hole_when_disabled(
    _patch_hero_bundle: None, _patch_legacy_bundle: None
) -> None:
    response = client.post(
        "/api/watch/hud/hole",
        json={
            "memberId": "mem-hero",
            "runId": "run-hero",
            "hole": 1,
            "courseId": "hero-course",
            "lat": 37.00058,
            "lon": -122.0,
            "autoDetectHole": False,
        },
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["hole"] == 1


def test_watch_hud_overrides_when_confident(
    _patch_hero_bundle: None, _patch_legacy_bundle: None
) -> None:
    response = client.post(
        "/api/watch/hud/hole",
        json={
            "memberId": "mem-hero",
            "runId": "run-hero",
            "hole": 2,
            "courseId": "hero-course",
            "lat": 37.00118,
            "lon": -122.0,
        },
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["hole"] == 3


def test_watch_hud_does_not_override_on_low_confidence(
    monkeypatch: pytest.MonkeyPatch,
    _patch_hero_bundle: None,
    _patch_legacy_bundle: None,
) -> None:
    monkeypatch.setattr(
        hud_service,
        "suggest_hole_for_location",
        lambda **kwargs: SuggestedHole(
            hole=9, distance_m=400.0, confidence=0.0, reason="low_confidence_test"
        ),
    )

    response = client.post(
        "/api/watch/hud/hole",
        json={
            "memberId": "mem-hero",
            "runId": "run-hero",
            "hole": 5,
            "courseId": "hero-course",
            "lat": 40.0,
            "lon": -120.0,
        },
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["hole"] == 5
