from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Mapping

from .defaults import DEFAULT_DISTANCE_TABLE_M, build_default_bag
from .models import ClubDistanceEntry, ClubDistancePublic, PlayerBag, PlayerBagPublic


class PlayerBagService:
    def __init__(self, base_dir: str | Path | None = None) -> None:
        base = Path(base_dir or os.getenv("GOLFIQ_BAGS_DIR", "data/bags")).expanduser()
        self._base_dir = base.resolve()

    def _bag_path(self, player_id: str) -> Path:
        safe = player_id.replace("/", "_")
        return self._base_dir / f"{safe}.json"

    def _load_bag(self, player_id: str) -> PlayerBag | None:
        path = self._bag_path(player_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return PlayerBag(**data)

    def _write_bag(self, bag: PlayerBag) -> None:
        self._base_dir.mkdir(parents=True, exist_ok=True)
        payload = bag.model_dump(mode="python", by_alias=True)
        path = self._bag_path(bag.player_id)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True, default=str))

    def _refresh_stats(self, club: ClubDistanceEntry) -> None:
        if club.sample_count <= 0:
            club.avg_carry_m = None
            club.std_dev_m = None
            return

        club.avg_carry_m = club.sum_carry_m / club.sample_count
        if club.sample_count <= 1:
            club.std_dev_m = None
        else:
            variance = (
                club.sum_sq_carry_m - (club.sum_carry_m**2) / club.sample_count
            ) / (club.sample_count - 1)
            club.std_dev_m = math.sqrt(max(0.0, variance))

    def _refresh_bag(self, bag: PlayerBag) -> PlayerBag:
        for club in bag.clubs:
            self._refresh_stats(club)
        return bag

    def get_bag(self, player_id: str) -> PlayerBag:
        bag = self._load_bag(player_id)
        if bag is None:
            bag = build_default_bag(player_id)
            self._write_bag(bag)
        return self._refresh_bag(bag)

    def _get_or_create_club(
        self, bag: PlayerBag, club_id: str, label: str | None
    ) -> ClubDistanceEntry:
        for club in bag.clubs:
            if club.club_id == club_id:
                return club
        new_club = ClubDistanceEntry(
            club_id=club_id,
            label=label or club_id,
            active=True,
            last_updated=datetime.now(timezone.utc),
        )
        bag.clubs.append(new_club)
        return new_club

    def update_clubs(
        self, player_id: str, updates: Iterable[Mapping[str, object]]
    ) -> PlayerBag:
        bag = self.get_bag(player_id)
        now = datetime.now(timezone.utc)
        for update in updates:
            club_id = str(update.get("club_id") or update.get("clubId"))
            label = update.get("label")
            active = update.get("active")
            manual_avg_carry_m = update.get("manual_avg_carry_m")
            if manual_avg_carry_m is None and "manual_avg_carry_m" not in update:
                manual_avg_carry_m = update.get("manualAvgCarryM")

            club = self._get_or_create_club(
                bag, club_id, label if isinstance(label, str) else None
            )
            if "label" in update and isinstance(label, str):
                club.label = label
            if "active" in update and isinstance(active, bool):
                club.active = active
            if "manual_avg_carry_m" in update or "manualAvgCarryM" in update:
                club.manual_avg_carry_m = (
                    float(manual_avg_carry_m)
                    if manual_avg_carry_m is not None
                    else None
                )
                club.last_updated = now

        self._write_bag(bag)
        return self._refresh_bag(bag)

    def record_distance(
        self,
        *,
        player_id: str,
        club_id: str,
        carry_m: float,
        timestamp: datetime | None = None,
    ) -> PlayerBag:
        bag = self.get_bag(player_id)
        club = self._get_or_create_club(bag, club_id, label=club_id)
        club.sample_count += 1
        club.sum_carry_m += carry_m
        club.sum_sq_carry_m += carry_m * carry_m
        club.last_updated = timestamp or datetime.now(timezone.utc)
        self._refresh_stats(club)
        self._write_bag(bag)
        return bag

    def to_public(self, bag: PlayerBag) -> PlayerBagPublic:
        return PlayerBagPublic(
            player_id=bag.player_id,
            clubs=[
                ClubDistancePublic(
                    clubId=club.club_id,
                    label=club.label,
                    active=club.active,
                    avgCarryM=club.avg_carry_m,
                    stdDevM=club.std_dev_m,
                    sampleCount=club.sample_count,
                    lastUpdated=club.last_updated,
                    manualAvgCarryM=club.manual_avg_carry_m,
                )
                for club in bag.clubs
            ],
        )

    def get_carries_map(self, player_id: str) -> dict[str, float]:
        bag = self.get_bag(player_id)
        carries: dict[str, float] = {}
        for club in bag.clubs:
            if not club.active:
                continue
            carry = (
                club.manual_avg_carry_m
                if club.manual_avg_carry_m is not None
                else club.avg_carry_m
            )
            if carry is None:
                carry = DEFAULT_DISTANCE_TABLE_M.get(club.club_id)
            if carry is not None:
                carries[club.club_id] = carry
        if not carries:
            return DEFAULT_DISTANCE_TABLE_M
        return carries


@lru_cache(maxsize=1)
def get_player_bag_service() -> PlayerBagService:
    return PlayerBagService()


__all__ = ["PlayerBagService", "get_player_bag_service"]
