from __future__ import annotations

import math
from datetime import datetime

from server.bundles.geometry import haversine_m
from server.bag.service import PlayerBagService, get_player_bag_service
from server.club_distance.constants import ELEVATION_COEFFICIENT, HEADWIND_COEFFICIENT
from server.rounds.models import Shot
from server.rounds.service import RoundService, get_round_service


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)

    x = math.sin(delta_lon) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(
        lat2_rad
    ) * math.cos(delta_lon)
    bearing_rad = math.atan2(x, y)
    return (math.degrees(bearing_rad) + 360) % 360


def _headwind_component(
    wind_speed_mps: float, wind_direction_deg: float | None, shot_bearing_deg: float
) -> float:
    if wind_speed_mps <= 0 or wind_direction_deg is None:
        return 0.0
    relative_rad = math.radians((wind_direction_deg - shot_bearing_deg) % 360)
    return wind_speed_mps * math.cos(relative_rad)


def compute_baseline_carry(shot: Shot) -> float:
    end_lat = shot.end_lat if shot.end_lat is not None else shot.start_lat
    end_lon = shot.end_lon if shot.end_lon is not None else shot.start_lon

    raw_carry = haversine_m(shot.start_lat, shot.start_lon, end_lat, end_lon)
    bearing = _bearing_deg(shot.start_lat, shot.start_lon, end_lat, end_lon)
    headwind = _headwind_component(
        shot.wind_speed_mps or 0.0, shot.wind_direction_deg, bearing
    )
    elevation_delta = shot.elevation_delta_m or 0.0

    baseline = (
        raw_carry
        - headwind * HEADWIND_COEFFICIENT
        - elevation_delta * ELEVATION_COEFFICIENT
    )
    return baseline


def update_club_distances_from_round(
    round_id: str,
    player_id: str,
    *,
    round_service: RoundService | None = None,
    bag_service: PlayerBagService | None = None,
) -> None:
    rounds = round_service or get_round_service()
    bags = bag_service or get_player_bag_service()

    shots = rounds.list_shots(player_id=player_id, round_id=round_id)
    for shot in shots:
        if not shot.club:
            continue
        carry_m = compute_baseline_carry(shot)
        bags.record_distance(
            player_id=player_id,
            club_id=shot.club,
            carry_m=carry_m,
            timestamp=(
                shot.created_at if isinstance(shot.created_at, datetime) else None
            ),
        )


__all__ = ["compute_baseline_carry", "update_club_distances_from_round"]
