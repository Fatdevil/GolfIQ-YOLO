from __future__ import annotations

import math
from collections import defaultdict
from datetime import UTC, datetime
from typing import Dict, Iterable, Literal

from server.bundles.geometry import haversine_m

from .constants import ELEVATION_COEFFICIENT, HEADWIND_COEFFICIENT
from .models import (
    ClubDistanceStats,
    ClubLateralStats,
    OnCourseShot,
    PlayerClubDistanceProfile,
)


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


def _side_offset_from_target(
    start_lat: float,
    start_lon: float,
    target_lat: float,
    target_lon: float,
    end_lat: float,
    end_lon: float,
) -> float:
    """Approximate sideways offset from target line in meters.

    Positive values represent misses to the right of the intended target line.
    """

    earth_radius_m = 6_371_000
    mean_lat_rad = math.radians((start_lat + target_lat) / 2)

    dx_target = (
        math.radians(target_lon - start_lon) * math.cos(mean_lat_rad) * earth_radius_m
    )
    dy_target = math.radians(target_lat - start_lat) * earth_radius_m

    dx_end = math.radians(end_lon - start_lon) * math.cos(mean_lat_rad) * earth_radius_m
    dy_end = math.radians(end_lat - start_lat) * earth_radius_m

    denom = math.hypot(dx_target, dy_target)
    if denom == 0:
        return 0.0

    cross = dx_target * dy_end - dy_target * dx_end
    # Cross-track distance is signed; invert so positive is right of target line
    return -(cross / denom)


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


class LateralRecord:
    def __init__(self) -> None:
        self.stats = RunningStats()
        self.outlier_left_count = 0
        self.outlier_right_count = 0

    def update(self, side_m: float, timestamp: datetime | None = None) -> None:
        current_std = self.stats.stddev or 0.0
        threshold = max(20.0, 2.5 * current_std)
        if side_m < -threshold:
            self.outlier_left_count += 1
        elif side_m > threshold:
            self.outlier_right_count += 1

        self.stats.update(side_m, timestamp)


class ClubDistanceRecord:
    def __init__(self) -> None:
        self.stats = RunningStats()
        self.manual_carry_m: float | None = None
        self.source: Literal["auto", "manual"] = "auto"
        self.lateral = LateralRecord()

    def to_stats(self, club: str) -> ClubDistanceStats:
        last_updated = self.stats.last_updated or datetime.now(UTC)
        lateral_stats: ClubLateralStats | None = None
        if self.lateral.stats.count > 0:
            lateral_stats = ClubLateralStats(
                mean_side_m=self.lateral.stats.mean,
                std_side_m=self.lateral.stats.stddev or 0.0,
                outlier_left_count=self.lateral.outlier_left_count,
                outlier_right_count=self.lateral.outlier_right_count,
                total_shots=self.lateral.stats.count,
            )
        return ClubDistanceStats(
            club=club,
            samples=self.stats.count,
            baseline_carry_m=self.stats.mean,
            carry_std_m=self.stats.stddev,
            last_updated=last_updated,
            manual_carry_m=self.manual_carry_m,
            source=self.source,
            lateral=lateral_stats,
        )


class ClubDistanceAggregator:
    def __init__(self) -> None:
        self._stats: dict[str, dict[str, ClubDistanceRecord]] = defaultdict(
            lambda: defaultdict(ClubDistanceRecord)
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

    @staticmethod
    def _side_offset_m(shot: OnCourseShot) -> float:
        if shot.side_m is not None:
            return shot.side_m

        if shot.target_lat is not None and shot.target_lon is not None:
            return _side_offset_from_target(
                shot.start_lat,
                shot.start_lon,
                shot.target_lat,
                shot.target_lon,
                shot.end_lat,
                shot.end_lon,
            )

        return 0.0

    def ingest_shots(self, shots: Iterable[OnCourseShot]) -> None:
        for shot in shots:
            self.update_from_shot(shot)

    def update_from_shot(self, shot: OnCourseShot) -> ClubDistanceStats:
        baseline_carry = self._normalize_shot(shot)
        record = self._stats[shot.player_id][shot.club]
        record.stats.update(baseline_carry, shot.recorded_at)
        side_offset_m = self._side_offset_m(shot)
        record.lateral.update(side_offset_m, shot.recorded_at)

        return record.to_stats(shot.club)

    def set_manual_override(
        self,
        player_id: str,
        club: str,
        manual_carry_m: float,
        source: Literal["auto", "manual"],
    ) -> ClubDistanceStats:
        record = self._stats[player_id][club]
        now = datetime.now(UTC)
        if record.stats.count == 0:
            record.stats.mean = manual_carry_m
        record.stats.last_updated = now
        record.manual_carry_m = manual_carry_m
        record.source = source
        return record.to_stats(club)

    def clear_manual_override(self, player_id: str, club: str) -> ClubDistanceStats:
        record = self._stats[player_id][club]
        now = datetime.now(UTC)
        if record.stats.count == 0:
            record.stats.mean = 0.0
            record.stats.m2 = 0.0
        record.manual_carry_m = None
        record.source = "auto"
        record.stats.last_updated = now
        return record.to_stats(club)

    def get_stats_for_club(self, player_id: str, club: str) -> ClubDistanceStats:
        record = self._stats.get(player_id, {}).get(club)
        if record is None:
            record = self._stats[player_id][club]
            record.stats.last_updated = datetime.now(UTC)
        return record.to_stats(club)

    def get_profile(self, player_id: str) -> PlayerClubDistanceProfile:
        clubs: Dict[str, ClubDistanceStats] = {}
        for club, record in self._stats.get(player_id, {}).items():
            clubs[club] = record.to_stats(club)
        return PlayerClubDistanceProfile(player_id=player_id, clubs=clubs)


__all__ = ["ClubDistanceAggregator", "RunningStats"]
