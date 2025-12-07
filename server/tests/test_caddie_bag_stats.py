from datetime import datetime, timezone

from server.caddie.bag_stats import compute_bag_stats
from server.rounds.models import Shot


def _shot(club: str, distance_m: float) -> Shot:
    delta_deg = distance_m / 111_111
    return Shot(
        id=f"{club}-{distance_m}",
        round_id="r1",
        player_id="p1",
        hole_number=1,
        club=club,
        created_at=datetime.now(timezone.utc),
        start_lat=0.0,
        start_lon=0.0,
        end_lat=delta_deg,
        end_lon=0.0,
        wind_speed_mps=0.0,
        wind_direction_deg=None,
        elevation_delta_m=0.0,
        note=None,
    )


def test_compute_bag_stats_trims_outliers():
    shots = [
        _shot("7i", 140),
        _shot("7i", 145),
        _shot("7i", 150),
        _shot("7i", 142),
        _shot("7i", 500),
    ]

    stats = compute_bag_stats(shots)
    seven = stats.get("7i")

    assert seven is not None
    assert seven.sample_count == 3
    assert 144 <= seven.mean_distance_m <= 146
    assert seven.p20_distance_m is not None and 142 <= seven.p20_distance_m <= 143
    assert seven.p80_distance_m is not None and 145 <= seven.p80_distance_m <= 146


def test_compute_bag_stats_handles_multiple_clubs():
    shots = [
        _shot("7i", 150),
        _shot("7i", 152),
        _shot("7i", 149),
        _shot("9i", 130),
        _shot("9i", 131),
    ]

    stats = compute_bag_stats(shots)

    assert set(stats.keys()) == {"7i", "9i"}
    assert stats["7i"].sample_count == 3
    assert stats["9i"].sample_count == 2
    assert 130 <= stats["9i"].mean_distance_m <= 131
