from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterable, List

from .models import (
    ROUNDS_DIR,
    HoleScore,
    Round,
    RoundInfo,
    RoundRecord,
    RoundScores,
    RoundSummary,
    Shot,
    ShotRecord,
    compute_round_summary,
)


class RoundNotFound(Exception):
    pass


class RoundOwnershipError(Exception):
    pass


SAFE_PLAYER_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _sanitize_player_id(player_id: str) -> str:
    """
    Restrict player ids to filesystem-safe characters to prevent path traversal.

    Only allow ASCII letters, digits, underscores, and dashes. Reject anything else.
    """

    if not SAFE_PLAYER_ID_RE.match(player_id):
        raise ValueError(f"Invalid player_id for filesystem usage: {player_id!r}")
    return player_id


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
        tempo_backswing_ms: int | None,
        tempo_downswing_ms: int | None,
        tempo_ratio: float | None,
    ) -> Shot:
        record = self._load_round(round_id)
        if record is None:
            raise RoundNotFound(round_id)
        if record.player_id != player_id:
            raise RoundOwnershipError(round_id)

        ratio = tempo_ratio
        if (
            ratio is None
            and tempo_backswing_ms is not None
            and tempo_downswing_ms is not None
        ):
            try:
                if tempo_downswing_ms > 0:
                    ratio = float(tempo_backswing_ms) / float(tempo_downswing_ms)
            except ZeroDivisionError:
                ratio = None

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
            tempo_backswing_ms=tempo_backswing_ms,
            tempo_downswing_ms=tempo_downswing_ms,
            tempo_ratio=ratio,
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
    def list_rounds(self, *, player_id: str, limit: int = 50) -> List[RoundInfo]:
        records = self._list_round_records(player_id=player_id, limit=limit)
        return [
            RoundInfo(
                id=record.id,
                player_id=record.player_id,
                course_id=record.course_id,
                course_name=None,
                tee_name=record.tee_name,
                holes=record.holes,
                started_at=record.started_at,
                ended_at=record.ended_at,
            )
            for record in records
        ]

    def get_round_summaries(
        self, *, player_id: str, limit: int = 50
    ) -> list[RoundSummary]:
        summaries: list[RoundSummary] = []
        for record in self._list_round_records(player_id=player_id, limit=limit):
            try:
                scores = self._read_scores(record)
                summaries.append(compute_round_summary(scores))
            except Exception:
                continue
        return summaries

    def _list_round_records(self, *, player_id: str, limit: int) -> list[RoundRecord]:
        player_dir = self._player_dir(player_id)
        if not player_dir.exists():
            return []

        round_records: list[RoundRecord] = []
        for round_path in player_dir.iterdir():
            meta_path = round_path / "round.json"
            if not meta_path.exists():
                continue
            try:
                data = json.loads(meta_path.read_text())
                record = RoundRecord.from_dict(data)
                round_records.append(record)
            except Exception:
                continue

        round_records.sort(
            key=lambda r: (
                r.ended_at or r.started_at or datetime.min.replace(tzinfo=timezone.utc)
            ),
            reverse=True,
        )
        return round_records[: max(1, limit)]

    # Internal helpers
    def _player_dir(self, player_id: str) -> Path:
        safe_id = _sanitize_player_id(player_id)
        return self._base_dir / safe_id

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

    # Scoring
    def get_scores(self, *, player_id: str, round_id: str) -> RoundScores:
        record = self._load_round(round_id)
        if record is None:
            raise RoundNotFound(round_id)
        if record.player_id != player_id:
            raise RoundOwnershipError(round_id)

        return self._read_scores(record)

    def upsert_hole_score(
        self, *, player_id: str, round_id: str, hole_number: int, updates: dict
    ) -> RoundScores:
        if hole_number < 1 or hole_number > 27:
            raise ValueError("hole_number must be between 1 and 27")

        record = self._load_round(round_id)
        if record is None:
            raise RoundNotFound(round_id)
        if record.player_id != player_id:
            raise RoundOwnershipError(round_id)

        scores = self._read_scores(record)
        existing = scores.holes.get(hole_number)
        merged_data = existing.model_dump(exclude_none=False) if existing else {}
        merged_data.update(updates)
        merged_data["hole_number"] = hole_number
        scores.holes[hole_number] = HoleScore(**merged_data)
        self._write_scores(scores)
        return scores

    def update_pars(
        self, *, player_id: str, round_id: str, pars: dict[int, int]
    ) -> RoundScores:
        record = self._load_round(round_id)
        if record is None:
            raise RoundNotFound(round_id)
        if record.player_id != player_id:
            raise RoundOwnershipError(round_id)

        scores = self._read_scores(record)
        for hole_number, par in pars.items():
            existing = scores.holes.get(hole_number)
            merged = existing.model_dump(exclude_none=False) if existing else {}
            merged.update({"par": par, "hole_number": hole_number})
            scores.holes[hole_number] = HoleScore(**merged)
        self._write_scores(scores)
        return scores

    def _scores_path(self, record: RoundRecord) -> Path:
        return self._round_dir(record.player_id, record.id) / "scores.json"

    def _read_scores(self, record: RoundRecord) -> RoundScores:
        path = self._scores_path(record)
        holes: dict[int, HoleScore] = {}
        if path.exists():
            try:
                data = json.loads(path.read_text())
                for hole_key, hole_payload in data.get("holes", {}).items():
                    try:
                        hole_number = int(hole_key)
                    except (TypeError, ValueError):
                        continue
                    payload = dict(hole_payload or {})
                    payload.setdefault("hole_number", hole_number)
                    try:
                        holes[hole_number] = HoleScore(**payload)
                    except Exception:
                        continue
            except Exception:
                holes = {}

        return RoundScores(
            round_id=record.id,
            player_id=record.player_id,
            holes=holes,
        )

    def _write_scores(self, scores: RoundScores) -> None:
        round_dir = self._round_dir(scores.player_id, scores.round_id)
        round_dir.mkdir(parents=True, exist_ok=True)
        holes_payload = {
            str(hole): hole_score.model_dump(by_alias=True, exclude_none=True)
            for hole, hole_score in scores.holes.items()
        }
        payload = {
            "round_id": scores.round_id,
            "player_id": scores.player_id,
            "holes": holes_payload,
        }
        path = round_dir / "scores.json"
        path.write_text(json.dumps(payload, indent=2, sort_keys=True))


@lru_cache(maxsize=1)
def get_round_service() -> RoundService:
    return RoundService()


__all__ = [
    "RoundService",
    "RoundNotFound",
    "RoundOwnershipError",
    "get_round_service",
]
