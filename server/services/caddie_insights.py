from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, Mapping, MutableMapping

from pydantic import BaseModel, Field

from server.schemas.caddie_telemetry import (
    CADDIE_ADVICE_ACCEPTED_V1,
    CADDIE_ADVICE_SHOWN_V1,
)


class CaddieClubStats(BaseModel):
    club: str
    shown: int
    accepted: int


class CaddieInsights(BaseModel):
    memberId: str = Field(..., description="Member ID for the aggregated telemetry")
    from_ts: datetime
    to_ts: datetime
    advice_shown: int
    advice_accepted: int
    accept_rate: float | None
    per_club: list[CaddieClubStats]


CADDIE_TYPES = {CADDIE_ADVICE_SHOWN_V1, CADDIE_ADVICE_ACCEPTED_V1}
_DEFAULT_FLIGHT_DIR = Path(__file__).resolve().parents[1] / "var" / "flight"


def _flight_dir() -> Path:
    override = os.getenv("FLIGHT_RECORDER_DIR")
    if override:
        return Path(override)
    return _DEFAULT_FLIGHT_DIR


def _merge_payload(event: Mapping[str, object]) -> Dict[str, object]:
    merged: Dict[str, object] = dict(event)
    nested = event.get("payload")
    if isinstance(nested, Mapping):
        merged.update(nested)
    return merged


def _coerce_ts(
    payload: Mapping[str, object], fallback_date: date | None
) -> datetime | None:
    candidate = payload.get("ts") or payload.get("timestampMs")
    if isinstance(candidate, (int, float)):
        seconds = float(candidate)
        if seconds > 1e12:
            seconds = seconds / 1000.0
        return datetime.fromtimestamp(seconds, timezone.utc)

    raw_ts = payload.get("timestamp")
    if isinstance(raw_ts, (int, float)):
        seconds = float(raw_ts)
        if seconds > 1e12:
            seconds = seconds / 1000.0
        return datetime.fromtimestamp(seconds, timezone.utc)
    if isinstance(raw_ts, str):
        cleaned = raw_ts.strip()
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(cleaned)
        except ValueError:
            parsed = None
        if parsed:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            else:
                parsed = parsed.astimezone(timezone.utc)
            return parsed

    if fallback_date:
        return datetime.combine(fallback_date, time.min, tzinfo=timezone.utc)
    return None


def _extract_date_from_filename(path: Path) -> date | None:
    stem = path.stem.replace("flight-", "")
    try:
        return datetime.fromisoformat(stem).date()
    except ValueError:
        return None


def compute_caddie_insights(
    events: Iterable[Mapping[str, object]],
    member_id: str,
    window: timedelta,
    *,
    now: datetime | None = None,
) -> CaddieInsights:
    """
    Aggregate caddie telemetry for ``member_id`` within ``window`` ending at ``now``.
    """

    to_ts = now or datetime.now(timezone.utc)
    from_ts = to_ts - window

    advice_shown = 0
    advice_accepted = 0
    per_club: Dict[str, MutableMapping[str, int]] = defaultdict(
        lambda: {"shown": 0, "accepted": 0}
    )

    for event in events:
        payload = _merge_payload(event)
        if payload.get("memberId") != member_id:
            continue

        event_type = payload.get("type")
        if event_type not in CADDIE_TYPES:
            continue

        event_ts = _coerce_ts(payload, fallback_date=None)
        if event_ts is None:
            event_ts = to_ts

        if event_ts < from_ts or event_ts > to_ts:
            continue

        club = (
            payload.get("recommendedClub")
            or payload.get("selectedClub")
            or payload.get("club")
        )

        if event_type == CADDIE_ADVICE_SHOWN_V1:
            advice_shown += 1
            if isinstance(club, str):
                per_club[club]["shown"] += 1
        elif event_type == CADDIE_ADVICE_ACCEPTED_V1:
            advice_accepted += 1
            if isinstance(club, str):
                per_club[club]["accepted"] += 1

    accept_rate = advice_accepted / advice_shown if advice_shown > 0 else None

    per_club_stats = [
        CaddieClubStats(club=club, shown=stats["shown"], accepted=stats["accepted"])
        for club, stats in sorted(per_club.items())
    ]

    return CaddieInsights(
        memberId=member_id,
        from_ts=from_ts,
        to_ts=to_ts,
        advice_shown=advice_shown,
        advice_accepted=advice_accepted,
        accept_rate=accept_rate,
        per_club=per_club_stats,
    )


def load_member_events(
    member_id: str, window: timedelta, *, now: datetime | None = None
) -> list[Mapping[str, object]]:
    directory = _flight_dir()
    if not directory.exists():
        return []

    to_ts = now or datetime.now(timezone.utc)
    from_ts = to_ts - window

    events: list[Mapping[str, object]] = []
    for path in sorted(directory.glob("flight-*.jsonl"), reverse=True):
        file_date = _extract_date_from_filename(path)
        if file_date and file_date < from_ts.date():
            break

        try:
            with path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(payload, Mapping):
                        continue

                    merged = _merge_payload(payload)
                    if merged.get("memberId") != member_id:
                        continue

                    event_ts = _coerce_ts(merged, fallback_date=file_date)
                    if event_ts is not None and (
                        event_ts < from_ts or event_ts > to_ts
                    ):
                        continue

                    events.append(merged)
        except OSError:
            continue

    return events


def load_and_compute_caddie_insights(
    member_id: str, window: timedelta, *, now: datetime | None = None
) -> CaddieInsights:
    events = load_member_events(member_id, window, now=now)
    return compute_caddie_insights(events, member_id, window, now=now)


__all__ = [
    "CaddieClubStats",
    "CaddieInsights",
    "compute_caddie_insights",
    "load_member_events",
    "load_and_compute_caddie_insights",
]
