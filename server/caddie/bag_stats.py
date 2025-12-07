from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from pydantic import BaseModel, ConfigDict, Field

from server.bundles.geometry import haversine_m
from server.rounds.models import Shot
from server.rounds.club_distances import compute_baseline_carry


class BagClubStats(BaseModel):
    club_id: str = Field(alias="clubId")
    sample_count: int = Field(alias="sampleCount")
    mean_distance_m: float = Field(alias="meanDistanceM")
    p20_distance_m: float | None = Field(default=None, alias="p20DistanceM")
    p80_distance_m: float | None = Field(default=None, alias="p80DistanceM")

    model_config = ConfigDict(populate_by_name=True)


def _shot_distance_m(shot: Shot) -> float | None:
    """Return the best available distance estimate for a shot.

    Prefer the baseline carry calculation (which normalizes for wind/elevation) when
    we have both start and end coordinates. If no endpoint is recorded, skip the
    shot to avoid polluting stats with zero-length placeholders.

    TODO: incorporate richer telemetry once available (e.g. actual carry distance,
    follow/unfollow decisions) to refine filtering.
    """

    if shot.end_lat is None or shot.end_lon is None:
        return None

    try:
        return compute_baseline_carry(shot)
    except Exception:
        try:
            return haversine_m(shot.start_lat, shot.start_lon, shot.end_lat, shot.end_lon)
        except Exception:
            return None


def _trim_outliers(values: list[float], trim_fraction: float = 0.1) -> list[float]:
    if not values:
        return []

    sorted_vals = sorted(values)
    if len(sorted_vals) < 3:
        return sorted_vals

    trim_each_side = int(len(sorted_vals) * trim_fraction)
    if len(sorted_vals) >= 4:
        trim_each_side = max(1, trim_each_side)
    trim_each_side = min(trim_each_side, (len(sorted_vals) - 1) // 2)
    if trim_each_side <= 0:
        return sorted_vals

    return sorted_vals[trim_each_side:-trim_each_side]


def _percentile(sorted_values: list[float], percentile: float) -> float | None:
    if not sorted_values:
        return None

    if percentile <= 0:
        return sorted_values[0]
    if percentile >= 100:
        return sorted_values[-1]

    rank = int(len(sorted_values) * (percentile / 100))
    rank = max(1, min(rank, len(sorted_values)))
    return sorted_values[rank - 1]


def compute_bag_stats(shots: Iterable[Shot]) -> dict[str, BagClubStats]:
    """Aggregate per-club distance stats from historical shots.

    Distances are trimmed to remove obvious outliers (up to ~10% from each tail)
    before computing means/percentiles so a single shank doesn't skew results.
    """

    grouped: dict[str, list[float]] = defaultdict(list)
    for shot in shots:
        distance = _shot_distance_m(shot)
        if distance is None or not distance > 0:
            continue
        grouped[shot.club].append(distance)

    stats: dict[str, BagClubStats] = {}
    for club, values in grouped.items():
        trimmed = _trim_outliers(values)
        if not trimmed:
            continue
        sorted_vals = sorted(trimmed)
        mean_distance = sum(sorted_vals) / len(sorted_vals)
        stats[club] = BagClubStats(
            clubId=club,
            sampleCount=len(sorted_vals),
            meanDistanceM=mean_distance,
            p20DistanceM=_percentile(sorted_vals, 20),
            p80DistanceM=_percentile(sorted_vals, 80),
        )

    return stats


__all__ = ["BagClubStats", "compute_bag_stats"]
