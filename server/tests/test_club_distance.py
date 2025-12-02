from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.api.routers.run_scores import _reset_state
from server.club_distance import (
    ClubDistanceAggregator,
    ClubDistanceService,
    OnCourseShot,
    compute_plays_like_distance,
    get_club_distance_service,
)


def _build_shot(
    *,
    player_id: str = "p1",
    club: str = "7i",
    start_lat: float = 0.0,
    start_lon: float = 0.0,
    end_lat: float = 0.0,
    end_lon: float = 0.001,
    wind_speed_mps: float = 0.0,
    wind_direction_deg: float | None = None,
    elevation_delta_m: float = 0.0,
    recorded_at: datetime | None = None,
) -> OnCourseShot:
    return OnCourseShot(
        player_id=player_id,
        club=club,
        start_lat=start_lat,
        start_lon=start_lon,
        end_lat=end_lat,
        end_lon=end_lon,
        wind_speed_mps=wind_speed_mps,
        wind_direction_deg=wind_direction_deg,
        elevation_delta_m=elevation_delta_m,
        recorded_at=recorded_at,
    )


def test_aggregator_computes_running_mean_and_stddev() -> None:
    aggregator = ClubDistanceAggregator()

    shot_one = _build_shot(wind_speed_mps=4.0, wind_direction_deg=90.0)
    shot_two = _build_shot(end_lon=0.0012, wind_speed_mps=6.0, wind_direction_deg=270.0)
    shot_three = _build_shot(
        end_lon=0.0011,
        wind_speed_mps=2.0,
        wind_direction_deg=90.0,
        elevation_delta_m=5.0,
        recorded_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )

    baselines = [
        aggregator._normalize_shot(shot_one),
        aggregator._normalize_shot(shot_two),
        aggregator._normalize_shot(shot_three),
    ]

    aggregator.ingest_shots([shot_one, shot_two, shot_three])

    profile = aggregator.get_profile("p1")
    stats = profile.clubs["7i"]

    assert stats.samples == 3
    assert stats.baseline_carry_m == pytest.approx(statistics.fmean(baselines))
    assert stats.carry_std_m == pytest.approx(statistics.stdev(baselines))
    assert stats.last_updated.tzinfo is not None
    assert stats.manual_carry_m is None
    assert stats.source == "auto"


def test_aggregator_handles_missing_player() -> None:
    aggregator = ClubDistanceAggregator()

    profile = aggregator.get_profile("missing")

    assert profile.player_id == "missing"
    assert profile.clubs == {}


def test_compute_plays_like_distance_applies_conditions() -> None:
    plays_like = compute_plays_like_distance(
        target_distance_m=150.0,
        wind_speed_mps=5.0,
        wind_direction_deg=0.0,
        elevation_delta_m=10.0,
    )

    # Headwind + uphill increases plays-like distance
    assert plays_like > 150.0

    tailwind = compute_plays_like_distance(
        target_distance_m=150.0,
        wind_speed_mps=5.0,
        wind_direction_deg=180.0,
        elevation_delta_m=-5.0,
    )
    assert tailwind < plays_like


def test_club_distance_endpoint_returns_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    aggregator = ClubDistanceAggregator()
    service = ClubDistanceService(aggregator)

    shot = _build_shot(
        player_id="player-123", wind_speed_mps=3.0, wind_direction_deg=90.0
    )
    service.ingest_shot(shot)

    app.dependency_overrides[get_club_distance_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.get(
                "/api/player/club-distances", headers={"x-api-key": "player-123"}
            )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert data[0]["club"] == "7i"
        assert data[0]["samples"] == 1
        assert data[0]["baselineCarryM"] > 0
        assert data[0]["manualCarryM"] is None
        assert data[0]["source"] == "auto"
    finally:
        app.dependency_overrides.pop(get_club_distance_service, None)


def test_set_manual_override_updates_stats(monkeypatch: pytest.MonkeyPatch) -> None:
    aggregator = ClubDistanceAggregator()
    service = ClubDistanceService(aggregator)

    shot = _build_shot(
        player_id="player-override", wind_speed_mps=2.0, wind_direction_deg=90.0
    )
    service.ingest_shot(shot)

    app.dependency_overrides[get_club_distance_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.put(
                "/api/player/club-distances/7i/override",
                headers={"x-api-key": "player-override"},
                json={"manualCarryM": 155.0, "source": "manual"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["manualCarryM"] == 155.0
        assert data["baselineCarryM"] > 0
        assert data["source"] == "manual"
    finally:
        app.dependency_overrides.pop(get_club_distance_service, None)


def test_clear_manual_override_resets_to_auto(monkeypatch: pytest.MonkeyPatch) -> None:
    aggregator = ClubDistanceAggregator()
    service = ClubDistanceService(aggregator)

    service.set_manual_override("player-reset", "7i", 150.0)

    app.dependency_overrides[get_club_distance_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.delete(
                "/api/player/club-distances/7i/override",
                headers={"x-api-key": "player-reset"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["manualCarryM"] is None
        assert data["source"] == "auto"
    finally:
        app.dependency_overrides.pop(get_club_distance_service, None)


def test_override_creates_minimal_record_when_missing_auto_stats(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    aggregator = ClubDistanceAggregator()
    service = ClubDistanceService(aggregator)

    app.dependency_overrides[get_club_distance_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.put(
                "/api/player/club-distances/PW/override",
                headers={"x-api-key": "player-new"},
                json={"manualCarryM": 105.0},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["club"] == "PW"
        assert data["samples"] == 0
        assert data["baselineCarryM"] == 105.0
        assert data["manualCarryM"] == 105.0
        assert data["source"] == "manual"
    finally:
        app.dependency_overrides.pop(get_club_distance_service, None)


def test_run_scores_ingests_on_course_shot() -> None:
    get_club_distance_service.cache_clear()
    _reset_state()

    with TestClient(app) as client:
        player_id = "player-on-course"
        run_id = "run-1"

        response = client.post(
            f"/api/runs/{run_id}/score",
            json={
                "dedupeKey": "shot-1",
                "ts": 1_700_000_000.0,
                "kind": "shot",
                "payload": {
                    "playerId": player_id,
                    "club": "7i",
                    "startLat": 0.0,
                    "startLon": 0.0,
                    "endLat": 0.0,
                    "endLon": 0.001,
                    "windSpeed_mps": 2.0,
                    "windDirectionDeg": 90.0,
                    "elevationDelta_m": 1.0,
                },
            },
        )

        assert response.status_code == 200

        profile = client.get(
            "/api/player/club-distances", headers={"x-api-key": player_id}
        )

        assert profile.status_code == 200
        data = profile.json()
        assert isinstance(data, list) and data
        assert data[0]["samples"] == 1
