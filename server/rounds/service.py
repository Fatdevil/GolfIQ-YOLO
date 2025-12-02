from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable, List

from .models import ROUNDS_DIR, Round, RoundRecord, Shot, ShotRecord


class RoundNotFound(Exception):
    pass


class RoundOwnershipError(Exception):
    pass


class RoundService:
    def __init__(self, base_dir: Path | str | None = None):
        base = Path(base_dir or os.getenv("GOLFIQ_ROUNDS_DIR", ROUNDS_DIR)).expanduser()
        self._base_dir = base.resolve()

    # Round lifecycle
    def start_round(
        self, *, player_id: str, course_id: str | None, tee_name: str | None, holes: int
    ) -> Round:
        round_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        record = RoundRecord(
            id=round_id,
            player_id=player_id,
            course_id=course_id,
            tee_name=tee_name,
            holes=holes or 18,
            started_at=now,
            ended_at=None,
        )
        self._write_round(record)
        return record.to_round()

    def end_round(self, *, player_id: str, round_id: str) -> Round:
        record = self._load_round(round_id)
        if record is None:
            raise RoundNotFound(round_id)
        if record.player_id != player_id:
            raise RoundOwnershipError(round_id)
        record.ended_at = datetime.now(timezone.utc)
        self._write_round(record)
        return record.to_round()

    # Shots
    def append_shot(
        self,
        *,
        player_id: str,
        round_id: str,
        hole_number: int,
        club: str,
        start_lat: float,
        start_lon: float,
        end_lat: float | None,
        end_lon: float | None,
        wind_speed_mps: float | None,
        wind_direction_deg: float | None,
        elevation_delta_m: float | None,
        note: str | None,
    ) -> Shot:
        record = self._load_round(round_id)
        if record is None:
            raise RoundNotFound(round_id)
        if record.player_id != player_id:
            raise RoundOwnershipError(round_id)

        shot = ShotRecord(
            id=str(uuid.uuid4()),
            round_id=round_id,
            player_id=player_id,
            hole_number=hole_number,
            club=club,
            created_at=datetime.now(timezone.utc),
            start_lat=start_lat,
            start_lon=start_lon,
            end_lat=end_lat,
            end_lon=end_lon,
            wind_speed_mps=wind_speed_mps,
            wind_direction_deg=wind_direction_deg,
            elevation_delta_m=elevation_delta_m,
            note=note,
        )
        self._append_shot_record(shot)
        return shot.to_shot()

    def list_shots(self, *, player_id: str, round_id: str) -> List[Shot]:
        record = self._load_round(round_id)
        if record is None:
            raise RoundNotFound(round_id)
        if record.player_id != player_id:
            raise RoundOwnershipError(round_id)

        return [s.to_shot() for s in self._read_shot_records(round_id)]

    # Queries
    def list_rounds(self, *, player_id: str, limit: int = 20) -> List[Round]:
        player_dir = self._player_dir(player_id)
        if not player_dir.exists():
            return []

        round_records: list[RoundRecord] = []
        for round_path in sorted(player_dir.iterdir(), reverse=True):
            meta_path = round_path / "round.json"
            if not meta_path.exists():
                continue
            try:
                data = json.loads(meta_path.read_text())
                record = RoundRecord.from_dict(data)
                round_records.append(record)
            except Exception:
                continue
            if len(round_records) >= max(1, limit):
                break

        return [
            r.to_round()
            for r in sorted(round_records, key=lambda r: r.started_at, reverse=True)
        ]

    # Internal helpers
    def _player_dir(self, player_id: str) -> Path:
        return self._base_dir / player_id

    def _round_dir(self, player_id: str, round_id: str) -> Path:
        return self._player_dir(player_id) / round_id

    def _write_round(self, record: RoundRecord) -> None:
        round_dir = self._round_dir(record.player_id, record.id)
        round_dir.mkdir(parents=True, exist_ok=True)
        (round_dir / "round.json").write_text(json.dumps(record.to_dict(), indent=2))

    def _load_round(self, round_id: str) -> RoundRecord | None:
        for player_dir in self._base_dir.glob("*"):
            meta_path = player_dir / round_id / "round.json"
            if meta_path.exists():
                try:
                    data = json.loads(meta_path.read_text())
                    return RoundRecord.from_dict(data)
                except Exception:
                    return None
        return None

    def _append_shot_record(self, shot: ShotRecord) -> None:
        round_dir = self._round_dir(shot.player_id, shot.round_id)
        round_dir.mkdir(parents=True, exist_ok=True)
        shot_path = round_dir / "shots.jsonl"
        with shot_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(shot.to_dict()))
            f.write("\n")

    def _read_shot_records(self, round_id: str) -> Iterable[ShotRecord]:
        for player_dir in self._base_dir.glob("*"):
            shot_path = player_dir / round_id / "shots.jsonl"
            if not shot_path.exists():
                continue
            with shot_path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        yield ShotRecord.from_dict(json.loads(line))
                    except Exception:
                        continue


@lru_cache(maxsize=1)
def get_round_service() -> RoundService:
    return RoundService()


__all__ = [
    "RoundService",
    "RoundNotFound",
    "RoundOwnershipError",
    "get_round_service",
]
