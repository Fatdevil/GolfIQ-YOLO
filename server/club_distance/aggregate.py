from __future__ import annotations

import math
from collections import defaultdict
from datetime import UTC, datetime
from typing import Dict, Iterable

from server.bundles.geometry import haversine_m

from .constants import ELEVATION_COEFFICIENT, HEADWIND_COEFFICIENT
from .models import ClubDistanceStats, OnCourseShot, PlayerClubDistanceProfile


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return bearing from point 1 to point 2 in degrees."""
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)

    x = math.sin(delta_lon) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(
        lat2_rad
    ) * math.cos(delta_lon)
    bearing_rad = math.atan2(x, y)
    bearing_deg = (math.degrees(bearing_rad) + 360) % 360
    return bearing_deg


def _headwind_component(
    wind_speed_mps: float, wind_direction_deg: float | None, shot_bearing_deg: float
) -> float:
    if wind_speed_mps <= 0 or wind_direction_deg is None:
        return 0.0
    relative_rad = math.radians((wind_direction_deg - shot_bearing_deg) % 360)
    return wind_speed_mps * math.cos(relative_rad)


class RunningStats:
    def __init__(self) -> None:
        self.count = 0
        self.mean = 0.0
        self.m2 = 0.0
        self.last_updated: datetime | None = None

    def update(self, value: float, timestamp: datetime | None = None) -> None:
        self.count += 1
        delta = value - self.mean
        self.mean += delta / self.count
        delta2 = value - self.mean
        self.m2 += delta * delta2
        ts = timestamp or datetime.now(UTC)
        self.last_updated = (
            ts if self.last_updated is None else max(self.last_updated, ts)
        )

    @property
    def variance(self) -> float:
        if self.count <= 1:
            return 0.0
        return self.m2 / (self.count - 1)

    @property
    def stddev(self) -> float | None:
        if self.count <= 1:
            return None
        return math.sqrt(self.variance)


class ClubDistanceAggregator:
    def __init__(self) -> None:
        self._stats: dict[str, dict[str, RunningStats]] = defaultdict(
            lambda: defaultdict(RunningStats)
        )

    @staticmethod
    def _normalize_shot(shot: OnCourseShot) -> float:
        raw_carry = haversine_m(
            shot.start_lat, shot.start_lon, shot.end_lat, shot.end_lon
        )
        bearing = _bearing_deg(
            shot.start_lat, shot.start_lon, shot.end_lat, shot.end_lon
        )
        headwind = _headwind_component(
            shot.wind_speed_mps, shot.wind_direction_deg, bearing
        )
        elevation_delta = shot.elevation_delta_m

        baseline = (
            raw_carry
            - headwind * HEADWIND_COEFFICIENT
            - elevation_delta * ELEVATION_COEFFICIENT
        )
        return baseline

    def ingest_shots(self, shots: Iterable[OnCourseShot]) -> None:
        for shot in shots:
            self.update_from_shot(shot)

    def update_from_shot(self, shot: OnCourseShot) -> ClubDistanceStats:
        baseline_carry = self._normalize_shot(shot)
        stats = self._stats[shot.player_id][shot.club]
        stats.update(baseline_carry, shot.recorded_at)

        return ClubDistanceStats(
            club=shot.club,
            samples=stats.count,
            baseline_carry_m=stats.mean,
            carry_std_m=stats.stddev,
            last_updated=stats.last_updated or datetime.now(UTC),
        )

    def get_profile(self, player_id: str) -> PlayerClubDistanceProfile:
        clubs: Dict[str, ClubDistanceStats] = {}
        for club, stats in self._stats.get(player_id, {}).items():
            clubs[club] = ClubDistanceStats(
                club=club,
                samples=stats.count,
                baseline_carry_m=stats.mean,
                carry_std_m=stats.stddev,
                last_updated=stats.last_updated or datetime.now(UTC),
            )
        return PlayerClubDistanceProfile(player_id=player_id, clubs=clubs)


__all__ = ["ClubDistanceAggregator", "RunningStats"]
