from __future__ import annotations

from functools import lru_cache
from typing import Iterable

from .aggregate import ClubDistanceAggregator
from .models import ClubDistanceStats, OnCourseShot, PlayerClubDistanceProfile
from server.rounds.models import Shot


class ClubDistanceService:
    def __init__(self, aggregator: ClubDistanceAggregator | None = None) -> None:
        self._aggregator = aggregator or ClubDistanceAggregator()

    def ingest_shot(self, shot: OnCourseShot) -> ClubDistanceStats:
        return self._aggregator.update_from_shot(shot)

    def ingest_shots(self, shots: Iterable[OnCourseShot]) -> None:
        self._aggregator.ingest_shots(shots)

    def ingest_shot_from_round(self, shot: Shot) -> ClubDistanceStats:
        end_lat = shot.end_lat if shot.end_lat is not None else shot.start_lat
        end_lon = shot.end_lon if shot.end_lon is not None else shot.start_lon
        payload = OnCourseShot(
            player_id=shot.player_id,
            club=shot.club,
            start_lat=shot.start_lat,
            start_lon=shot.start_lon,
            end_lat=end_lat,
            end_lon=end_lon,
            wind_speed_mps=shot.wind_speed_mps or 0.0,
            wind_direction_deg=shot.wind_direction_deg,
            elevation_delta_m=shot.elevation_delta_m or 0.0,
            recorded_at=shot.created_at,
        )
        return self.ingest_shot(payload)

    def get_profile(self, player_id: str) -> PlayerClubDistanceProfile:
        return self._aggregator.get_profile(player_id)

    def get_stats_for_club(self, player_id: str, club: str) -> ClubDistanceStats:
        return self._aggregator.get_stats_for_club(player_id, club)

    def set_manual_override(
        self, player_id: str, club: str, manual_carry_m: float, source: str = "manual"
    ) -> ClubDistanceStats:
        return self._aggregator.set_manual_override(
            player_id, club, manual_carry_m, source
        )

    def clear_manual_override(self, player_id: str, club: str) -> ClubDistanceStats:
        return self._aggregator.clear_manual_override(player_id, club)


@lru_cache(maxsize=1)
def get_club_distance_service() -> ClubDistanceService:
    return ClubDistanceService()


__all__ = ["ClubDistanceService", "get_club_distance_service"]
