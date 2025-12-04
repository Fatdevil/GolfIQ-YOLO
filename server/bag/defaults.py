from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from .models import ClubDistanceEntry, PlayerBag


DEFAULT_DISTANCE_TABLE_M = {
    "driver": 230.0,
    "3w": 215.0,
    "5w": 205.0,
    "3h": 200.0,
    "4i": 190.0,
    "5i": 180.0,
    "6i": 170.0,
    "7i": 160.0,
    "8i": 150.0,
    "9i": 140.0,
    "pw": 125.0,
    "gw": 110.0,
    "sw": 95.0,
    "lw": 80.0,
    "putter": 5.0,
}


def _default_clubs() -> List[ClubDistanceEntry]:
    now = datetime.now(timezone.utc)
    template = [
        ("driver", "Driver"),
        ("3w", "3-wood"),
        ("5w", "5-wood / Hybrid"),
        ("3h", "3-hybrid"),
        ("4i", "4-iron"),
        ("5i", "5-iron"),
        ("6i", "6-iron"),
        ("7i", "7-iron"),
        ("8i", "8-iron"),
        ("9i", "9-iron"),
        ("pw", "Pitching Wedge"),
        ("gw", "Gap Wedge"),
        ("sw", "Sand Wedge"),
        ("lw", "Lob Wedge"),
        ("putter", "Putter"),
    ]

    return [
        ClubDistanceEntry(
            club_id=club_id,
            label=label,
            active=True,
            last_updated=now,
        )
        for club_id, label in template
    ]


def build_default_bag(player_id: str) -> PlayerBag:
    return PlayerBag(player_id=player_id, clubs=_default_clubs())


__all__ = ["DEFAULT_DISTANCE_TABLE_M", "build_default_bag"]
