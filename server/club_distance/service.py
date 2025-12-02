from __future__ import annotations

from functools import lru_cache
from typing import Iterable

from .aggregate import ClubDistanceAggregator
from .models import ClubDistanceStats, OnCourseShot, PlayerClubDistanceProfile


class ClubDistanceService:
    def __init__(self, aggregator: ClubDistanceAggregator | None = None) -> None:
        self._aggregator = aggregator or ClubDistanceAggregator()

    def ingest_shot(self, shot: OnCourseShot) -> ClubDistanceStats:
        return self._aggregator.update_from_shot(shot)

    def ingest_shots(self, shots: Iterable[OnCourseShot]) -> None:
        self._aggregator.ingest_shots(shots)

    def get_profile(self, player_id: str) -> PlayerClubDistanceProfile:
        return self._aggregator.get_profile(player_id)


@lru_cache(maxsize=1)
def get_club_distance_service() -> ClubDistanceService:
    return ClubDistanceService()


__all__ = ["ClubDistanceService", "get_club_distance_service"]
