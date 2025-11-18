"""Bundle-powered HUD distance tests."""

from __future__ import annotations

from math import isfinite

from fastapi.testclient import TestClient

from server.app import app

client = TestClient(app, raise_server_exceptions=True)
HEADERS = {"x-api-key": "test-key"}


def _assert_positive_distance(value: float | None) -> None:
    assert value is not None
    assert isfinite(value)
    assert 0 < value < 1_000


def test_watch_hud_uses_hero_bundle_for_distances() -> None:
    response = client.post(
        "/api/watch/hud/hole",
        json={
            "memberId": "mem-hero",
            "runId": "run-hero",
            "hole": 1,
            "courseId": "links_crest",
            "lat": 56.4101,
            "lon": -2.7899,
        },
        headers=HEADERS,
    )
    assert response.status_code == 200

    hud = response.json()
    _assert_positive_distance(hud.get("toFront_m"))
    _assert_positive_distance(hud.get("toGreen_m"))
    _assert_positive_distance(hud.get("toBack_m"))


def test_watch_hud_falls_back_when_bundle_missing_or_position_absent() -> None:
    response_unknown = client.post(
        "/api/watch/hud/hole",
        json={
            "memberId": "mem-unknown",
            "runId": "run-unknown",
            "hole": 1,
            "courseId": "not_real",
            "lat": 56.4101,
            "lon": -2.7899,
        },
        headers=HEADERS,
    )
    assert response_unknown.status_code == 200
    hud_unknown = response_unknown.json()
    assert hud_unknown.get("toFront_m") is None or hud_unknown.get("toFront_m") >= 0

    response_missing_gnss = client.post(
        "/api/watch/hud/hole",
        json={
            "memberId": "mem-no-gnss",
            "runId": "run-no-gnss",
            "hole": 1,
            "courseId": "links_crest",
        },
        headers=HEADERS,
    )
    assert response_missing_gnss.status_code == 200
    hud_missing = response_missing_gnss.json()
    assert hud_missing.get("toFront_m") is None
    assert hud_missing.get("toGreen_m") is None
    assert hud_missing.get("toBack_m") is None
