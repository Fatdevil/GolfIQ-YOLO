"""Extended behaviour tests for watch HUD endpoints."""

from __future__ import annotations

import pytest

from fastapi.testclient import TestClient

from server.app import app
from server.caddie.schemas import AdviseOut
from server.courses.schemas import CourseBundle, GeoPoint, GreenFMB, HoleBundle
from server.watch import hud_service

client = TestClient(app, raise_server_exceptions=True)


class _DummyRun:
    def __init__(self, *, tournament_safe: bool) -> None:
        self.params = {
            "eventId": "evt-42",
            "courseId": "course-1",
            "tournamentSafe": tournament_safe,
        }
        self.metrics = {"shotsTaken": 2}
        self.events = [1, 2]


def _sample_bundle() -> CourseBundle:
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
        ],
    )


@pytest.fixture(autouse=True)
def _reset_tip_bus(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        hud_service, "get_latest_tip_for_member", lambda member_id: None
    )


def test_watch_hud_tick_returns_distances_and_caddie_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundle = _sample_bundle()
    monkeypatch.setattr(hud_service, "get_course_bundle", lambda course_id: bundle)
    monkeypatch.setattr(
        hud_service, "load_run", lambda run_id: _DummyRun(tournament_safe=False)
    )
    monkeypatch.setattr(hud_service, "lookup_plan_for_key", lambda _key: "pro")
    monkeypatch.setattr(
        hud_service,
        "suggest_hole",
        lambda bundle, lat, lon, current_hole=None: type(
            "Suggestion", (), {"hole": current_hole, "confidence": 0.95}
        )(),
    )
    monkeypatch.setattr(
        hud_service,
        "advise",
        lambda advise_in: AdviseOut(
            playsLike_m=151.0,
            confidence=0.76,
            silent=False,
            silent_reason=None,
        ),
    )

    response = client.post(
        "/api/watch/hud/tick",
        json={
            "memberId": "mem-77",
            "runId": "run-99",
            "hole": 1,
            "courseId": "course-1",
            "deviceId": "watch-1",
            "lat": 37.0006,
            "lon": -121.9994,
            "wind_mps": 3.0,
            "wind_dir_deg": 270.0,
            "temp_c": 21.0,
        },
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["hole"] == 1
    assert payload["courseId"] == "course-1"
    assert payload["toGreen_m"] is not None and payload["toGreen_m"] > 0
    assert payload["toFront_m"] is not None
    assert payload["toBack_m"] is not None
    assert payload["playsLike_m"] == pytest.approx(151.0)
    assert payload["caddie_confidence"] == pytest.approx(0.76)
    assert payload["caddie_silent"] is False
    assert payload["hasNewTip"] is False


def test_watch_hud_tick_respects_tournament_safe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bundle = _sample_bundle()
    monkeypatch.setattr(hud_service, "get_course_bundle", lambda course_id: bundle)
    monkeypatch.setattr(
        hud_service, "load_run", lambda run_id: _DummyRun(tournament_safe=True)
    )
    monkeypatch.setattr(hud_service, "lookup_plan_for_key", lambda _key: "pro")
    monkeypatch.setattr(
        hud_service,
        "suggest_hole",
        lambda bundle, lat, lon, current_hole=None: type(
            "Suggestion", (), {"hole": current_hole, "confidence": 0.95}
        )(),
    )
    monkeypatch.setattr(
        hud_service,
        "advise",
        lambda advise_in: AdviseOut(
            playsLike_m=175.0,
            confidence=0.9,
            silent=True,
            silent_reason="tournament_safe",
        ),
    )

    response = client.post(
        "/api/watch/hud/tick",
        json={
            "memberId": "mem-77",
            "runId": "run-99",
            "hole": 1,
            "courseId": "course-1",
            "deviceId": "watch-1",
            "lat": 37.0006,
            "lon": -121.9994,
        },
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["caddie_silent"] is True
    assert payload["caddie_silent_reason"] == "tournament_safe"
    assert payload["playsLike_m"] is None
    assert payload["caddie_confidence"] == pytest.approx(0.9)
