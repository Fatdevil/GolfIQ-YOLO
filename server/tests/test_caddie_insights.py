from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import caddie_insights as caddie_insights_route
from server.services.caddie_insights import CaddieInsights, compute_caddie_insights


@pytest.fixture(autouse=True)
def _api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_KEY", "secret")
    monkeypatch.setenv("REQUIRE_API_KEY", "1")


def test_compute_caddie_insights_counts() -> None:
    now = datetime(2024, 1, 31, tzinfo=timezone.utc)
    window = timedelta(days=30)

    events: list[dict[str, object]] = [
        {
            "type": "CADDIE_ADVICE_SHOWN_V1",
            "memberId": "m1",
            "ts": (now - timedelta(days=1)).timestamp() * 1000,
            "recommendedClub": "7i",
        },
        {
            "type": "CADDIE_ADVICE_ACCEPTED_V1",
            "memberId": "m1",
            "ts": (now - timedelta(days=2)).timestamp() * 1000,
            "selectedClub": "7i",
            "recommendedClub": "7i",
        },
        {
            "type": "CADDIE_ADVICE_SHOWN_V1",
            "memberId": "m1",
            "ts": (now - timedelta(days=10)).timestamp() * 1000,
            "recommendedClub": "8i",
        },
        {
            "type": "CADDIE_ADVICE_ACCEPTED_V1",
            "memberId": "m2",
            "ts": (now - timedelta(days=3)).timestamp() * 1000,
            "recommendedClub": "9i",
        },
        {
            "type": "CADDIE_ADVICE_SHOWN_V1",
            "memberId": "m1",
            "ts": (now - timedelta(days=45)).timestamp() * 1000,
            "recommendedClub": "pw",
        },
    ]

    insights = compute_caddie_insights(events, member_id="m1", window=window, now=now)

    assert insights.advice_shown == 2
    assert insights.advice_accepted == 1
    assert insights.accept_rate == 0.5

    per_club = {entry.club: entry for entry in insights.per_club}
    assert per_club["7i"].shown == 1
    assert per_club["7i"].accepted == 1
    assert per_club["8i"].shown == 1
    assert per_club["8i"].accepted == 0


def test_caddie_insights_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_now = datetime(2024, 2, 1, tzinfo=timezone.utc)
    expected = CaddieInsights(
        memberId="demo",
        from_ts=fake_now - timedelta(days=7),
        to_ts=fake_now,
        advice_shown=3,
        advice_accepted=2,
        accept_rate=2 / 3,
        per_club=[],
    )

    monkeypatch.setattr(
        caddie_insights_route,
        "load_and_compute_caddie_insights",
        lambda member_id, window: expected,
    )

    client = TestClient(app)
    response = client.get(
        "/api/caddie/insights",
        params={"memberId": "demo", "windowDays": 7},
        headers={"x-api-key": "secret"},
    )

    assert response.status_code == 200
    assert response.json()["memberId"] == "demo"
    assert response.json()["advice_shown"] == 3
    assert response.json()["advice_accepted"] == 2
