from __future__ import annotations

from server.bag.defaults import DEFAULT_DISTANCE_TABLE_M
from server.bag.service import get_player_bag_service
from server.caddie.player_bag import get_player_club_carries


def test_get_player_club_carries_prefers_manual_override(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_BAGS_DIR", str(tmp_path / "bags"))
    get_player_bag_service.cache_clear()

    service = get_player_bag_service()
    service.update_clubs(
        "member-1",
        [{"club_id": "7i", "manual_avg_carry_m": 142.0, "active": True}],
    )

    carries = get_player_club_carries("member-1", service=service)
    assert carries.get("7i") == 142.0


def test_get_player_club_carries_falls_back_to_defaults(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_BAGS_DIR", str(tmp_path / "bags"))
    get_player_bag_service.cache_clear()

    carries = get_player_club_carries("no-data")
    for club, dist in DEFAULT_DISTANCE_TABLE_M.items():
        assert carries.get(club) == dist
