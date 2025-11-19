import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import caddie_insights as caddie_insights_route
from server.services.caddie_insights import (
    CaddieInsights,
    compute_caddie_insights,
    load_and_compute_caddie_insights,
    load_member_events,
)


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


def test_compute_caddie_insights_no_matching_events() -> None:
    now = datetime(2024, 6, 1, tzinfo=timezone.utc)
    window = timedelta(days=14)

    events: list[dict[str, object]] = [
        {
            "type": "CADDIE_ADVICE_SHOWN_V1",
            "memberId": "other",
            "ts": (now - timedelta(days=1)).timestamp() * 1000,
        },
        {
            "type": "CADDIE_ADVICE_ACCEPTED_V1",
            "memberId": "other",
            "ts": (now - timedelta(days=2)).timestamp() * 1000,
        },
        {
            "type": "UNRELATED",
            "memberId": "m1",
            "ts": (now - timedelta(days=3)).timestamp() * 1000,
        },
    ]

    insights = compute_caddie_insights(events, member_id="m1", window=window, now=now)

    assert insights.advice_shown == 0
    assert insights.advice_accepted == 0
    assert insights.accept_rate is None
    assert insights.per_club == []


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


def _write_events(path: Path, events: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for event in events:
            handle.write(json.dumps(event) + "\n")


def test_load_and_compute_includes_boundary_day_without_ts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    flight_dir = tmp_path / "flight"
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(flight_dir))

    now = datetime(2025, 1, 8, 15, 30, tzinfo=timezone.utc)
    window = timedelta(days=7)

    from_date = now.date() - timedelta(days=7)
    to_date = now.date()

    _write_events(
        flight_dir / f"flight-{from_date.isoformat()}.jsonl",
        [
            {
                "type": "CADDIE_ADVICE_SHOWN_V1",
                "memberId": "m1",
                "recommendedClub": "7i",
            },
            {
                "type": "CADDIE_ADVICE_ACCEPTED_V1",
                "memberId": "m1",
                "ts": now.timestamp() * 1000,
                "selectedClub": "7i",
            },
        ],
    )

    _write_events(
        flight_dir / f"flight-{to_date.isoformat()}.jsonl",
        [
            {
                "type": "CADDIE_ADVICE_SHOWN_V1",
                "memberId": "m1",
                "ts": now.timestamp() * 1000,
                "recommendedClub": "8i",
            }
        ],
    )

    _write_events(
        flight_dir / "flight-2024-12-30.jsonl",
        [
            {
                "type": "CADDIE_ADVICE_SHOWN_V1",
                "memberId": "m1",
                "recommendedClub": "pw",
            }
        ],
    )

    insights = load_and_compute_caddie_insights("m1", window, now=now)

    assert insights.advice_shown == 2
    assert insights.advice_accepted == 1
    assert insights.accept_rate == 0.5

    per_club = {entry.club: entry for entry in insights.per_club}
    assert per_club["7i"].shown == 1
    assert per_club["7i"].accepted == 1
    assert per_club["8i"].shown == 1
    assert "pw" not in per_club


def test_load_member_events_mixes_ts_and_file_dates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    flight_dir = tmp_path / "flight"
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(flight_dir))

    now = datetime(2025, 1, 8, 12, 0, tzinfo=timezone.utc)
    window = timedelta(days=2)
    from_date = now.date() - timedelta(days=2)

    _write_events(
        flight_dir / f"flight-{from_date.isoformat()}.jsonl",
        [
            {
                "type": "CADDIE_ADVICE_SHOWN_V1",
                "memberId": "m2",
                "recommendedClub": "6i",
            },
            {
                "type": "CADDIE_ADVICE_ACCEPTED_V1",
                "memberId": "m2",
                "ts": (now - timedelta(days=2)).timestamp() * 1000,
                "selectedClub": "6i",
            },
        ],
    )

    _write_events(
        flight_dir / "flight-2025-01-08.jsonl",
        [
            {
                "type": "CADDIE_ADVICE_SHOWN_V1",
                "memberId": "m2",
                "ts": now.timestamp() * 1000,
                "recommendedClub": "5i",
            }
        ],
    )

    _write_events(
        flight_dir / "flight-2025-01-05.jsonl",
        [
            {
                "type": "CADDIE_ADVICE_SHOWN_V1",
                "memberId": "m2",
                "recommendedClub": "4i",
            }
        ],
    )

    events = load_member_events("m2", window, now=now)

    types = [event["type"] for event in events]
    assert "CADDIE_ADVICE_SHOWN_V1" in types
    assert "CADDIE_ADVICE_ACCEPTED_V1" in types
    assert len(events) == 3


def test_load_member_events_missing_directory(monkeypatch: pytest.MonkeyPatch) -> None:
    missing_dir = Path("/tmp/non-existent-flight")
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(missing_dir))

    events = load_member_events(
        "m1", timedelta(days=1), now=datetime(2024, 1, 1, tzinfo=timezone.utc)
    )

    assert events == []
