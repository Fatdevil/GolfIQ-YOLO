from __future__ import annotations

import math

from server.bag.service import get_player_bag_service
from server.rounds.club_distances import (
    compute_baseline_carry,
    update_club_distances_from_round,
)
from server.rounds.service import RoundService, get_round_service


def test_round_ingestion_updates_bag(tmp_path, monkeypatch):
    bag_dir = tmp_path / "bags"
    rounds_dir = tmp_path / "rounds"
    monkeypatch.setenv("GOLFIQ_BAGS_DIR", str(bag_dir))
    monkeypatch.setenv("GOLFIQ_ROUNDS_DIR", str(rounds_dir))

    get_player_bag_service.cache_clear()
    get_round_service.cache_clear()

    round_service: RoundService = get_round_service()
    bag_service = get_player_bag_service()

    round_info = round_service.start_round(
        player_id="player-1", course_id=None, tee_name=None, holes=18
    )
    shot_one = round_service.append_shot(
        player_id="player-1",
        round_id=round_info.id,
        hole_number=1,
        club="7i",
        start_lat=0.0,
        start_lon=0.0,
        end_lat=0.0,
        end_lon=0.0009,
        wind_speed_mps=0.0,
        wind_direction_deg=None,
        elevation_delta_m=0.0,
        note=None,
        tempo_backswing_ms=None,
        tempo_downswing_ms=None,
        tempo_ratio=None,
    )
    shot_two = round_service.append_shot(
        player_id="player-1",
        round_id=round_info.id,
        hole_number=1,
        club="7i",
        start_lat=0.0,
        start_lon=0.0,
        end_lat=0.0,
        end_lon=0.00135,
        wind_speed_mps=0.0,
        wind_direction_deg=None,
        elevation_delta_m=0.0,
        note=None,
        tempo_backswing_ms=None,
        tempo_downswing_ms=None,
        tempo_ratio=None,
    )

    update_club_distances_from_round(
        round_info.id,
        "player-1",
        round_service=round_service,
        bag_service=bag_service,
    )

    bag = bag_service.get_bag("player-1")
    seven_iron = next(c for c in bag.clubs if c.club_id == "7i")
    expected_values = [
        compute_baseline_carry(shot_one),
        compute_baseline_carry(shot_two),
    ]
    expected_average = sum(expected_values) / len(expected_values)

    assert seven_iron.sample_count == 2
    assert math.isclose(seven_iron.avg_carry_m or 0.0, expected_average, rel_tol=0.01)
