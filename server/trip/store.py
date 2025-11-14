from __future__ import annotations

import time
import secrets
from threading import Lock
from typing import Dict, List, Optional

from .models import TripHoleScore, TripPlayer, TripRound, new_trip_round_id

_TRIPS: Dict[str, TripRound] = {}
_LOCK = Lock()


def create_trip_round(
    course_name: str,
    holes: int,
    players: List[TripPlayer],
    course_id: Optional[str] = None,
    tees_name: Optional[str] = None,
) -> TripRound:
    trip_id = new_trip_round_id()
    trip = TripRound(
        id=trip_id,
        created_ts=time.time(),
        course_id=course_id,
        course_name=course_name,
        tees_name=tees_name,
        holes=holes,
        players=players,
    )
    with _LOCK:
        _TRIPS[trip_id] = trip
    return trip


def get_trip_round(trip_id: str) -> Optional[TripRound]:
    with _LOCK:
        return _TRIPS.get(trip_id)


def upsert_scores(trip_id: str, scores: List[TripHoleScore]) -> Optional[TripRound]:
    with _LOCK:
        trip = _TRIPS.get(trip_id)
        if not trip:
            return None

        valid_player_ids = {player.id for player in trip.players}

        for score in scores:
            if score.hole < 1 or score.hole > trip.holes:
                raise ValueError(
                    f"invalid score entry for hole={score.hole} player={score.player_id}"
                )
            if score.player_id not in valid_player_ids:
                raise ValueError(
                    f"invalid score entry for hole={score.hole} player={score.player_id}"
                )

        existing = {(s.hole, s.player_id): s for s in trip.scores}
        for score in scores:
            existing[(score.hole, score.player_id)] = score
        trip.scores = list(existing.values())
        _TRIPS[trip_id] = trip
        return trip


def issue_public_token(trip_id: str) -> Optional[str]:
    with _LOCK:
        trip = _TRIPS.get(trip_id)
        if not trip:
            return None
        if not trip.public_token:
            trip.public_token = secrets.token_urlsafe(16)
            _TRIPS[trip_id] = trip
        return trip.public_token


def get_trip_by_token(token: str) -> Optional[TripRound]:
    with _LOCK:
        for trip in _TRIPS.values():
            if trip.public_token == token:
                return trip
        return None
