"""Shared pytest fixtures for server tests."""

from __future__ import annotations

import time as _real_time
from typing import Callable

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.bag.service import get_player_bag_service
from server.club_distance import (
    ClubDistanceAggregator,
    ClubDistanceService,
    get_club_distance_service,
)
from server.rounds.service import RoundService, get_round_service


@pytest.fixture
def timewarp(monkeypatch: pytest.MonkeyPatch) -> Callable[[float], float]:
    """Advance time.time()/watch_devices._now_s without sleeping."""

    base = _real_time.time()
    offset = {"value": 0.0}

    def now() -> float:
        return base + offset["value"]

    def now_s() -> int:
        return int(now())

    def advance(seconds: float) -> float:
        offset["value"] += seconds
        return now()

    monkeypatch.setattr("time.time", now)
    monkeypatch.setattr("server.services.watch_devices._now_s", now_s)

    return advance


@pytest.fixture
def round_client(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_BAGS_DIR", str(tmp_path / "bags"))
    get_player_bag_service.cache_clear()
    service = RoundService(base_dir=tmp_path)
    club_service = ClubDistanceService(ClubDistanceAggregator())
    app.dependency_overrides[get_round_service] = lambda: service
    app.dependency_overrides[get_club_distance_service] = lambda: club_service
    client = TestClient(app)
    yield client, club_service, service
    app.dependency_overrides.pop(get_round_service, None)
    app.dependency_overrides.pop(get_club_distance_service, None)
    get_player_bag_service.cache_clear()
