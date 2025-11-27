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
    ignored: int | None = None


class ClubInsight(BaseModel):
    club_id: str = Field(..., description="Identifier for the club, e.g. 7i or PW")
    total_tips: int = Field(
        ..., description="Lifetime tips shown for this club in the window"
    )
    accepted: int = Field(..., description="Lifetime accepted tips for this club")
    ignored: int = Field(..., description="Lifetime ignored tips for this club")
    recent_accepted: int = Field(..., description="Accepted tips in the recent window")
    recent_total: int = Field(..., description="Tips shown in the recent window")
    trust_score: float = Field(
        ..., description="Weighted trust score 0-1 using recent + lifetime accept rates"
    )


class CaddieInsights(BaseModel):
    memberId: str = Field(..., description="Member ID for the aggregated telemetry")
    from_ts: datetime
    to_ts: datetime
    advice_shown: int
    advice_accepted: int
    accept_rate: float | None
    per_club: list[CaddieClubStats]
    recent_from_ts: datetime | None = Field(
        None, description="Start timestamp for the recent slice used in trust scoring"
    )
    recent_window_days: int | None = Field(
        None, description='Number of days considered "recent" for trends'
    )
    clubs: list[ClubInsight] = Field(
        default_factory=list,
        description="Per-club insights including recent vs lifetime stats and trust score",
    )


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
    payload: Mapping[str, object], fallback: object | None
) -> datetime | None:
    def _parse_candidate(value: object | None) -> datetime | None:
        if isinstance(value, datetime):
            return value.astimezone(timezone.utc)
        if isinstance(value, date):
            return datetime.combine(value, time.min, tzinfo=timezone.utc)
        if isinstance(value, (int, float)):
            seconds = float(value)
            if seconds > 1e12:
                seconds = seconds / 1000.0
            return datetime.fromtimestamp(seconds, timezone.utc)
        if isinstance(value, str):
            cleaned = value.strip()
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
        return None

    candidate = payload.get("ts") or payload.get("timestampMs")
    parsed = _parse_candidate(candidate)
    if parsed:
        return parsed

    raw_ts = payload.get("timestamp")
    parsed = _parse_candidate(raw_ts)
    if parsed:
        return parsed

    for alt_key in ("file_ts", "run_ts", "ingested_at", "captured_at"):
        parsed = _parse_candidate(payload.get(alt_key))
        if parsed:
            return parsed

    return _parse_candidate(fallback)


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
    recent_window: timedelta | None = None,
) -> CaddieInsights:
    """
    Aggregate caddie telemetry for ``member_id`` within ``window`` ending at ``now``.
    """

    to_ts = now or datetime.now(timezone.utc)
    from_ts = to_ts - window
    from_date = from_ts.date()
    to_date = to_ts.date()

    advice_shown = 0
    advice_accepted = 0
    per_club: Dict[str, MutableMapping[str, int]] = defaultdict(
        lambda: {"shown": 0, "accepted": 0, "recent_shown": 0, "recent_accepted": 0}
    )

    recency_window = recent_window or timedelta(days=7)
    if recency_window > window:
        recency_window = window
    recent_from_ts = to_ts - recency_window

    for event in events:
        payload = _merge_payload(event)
        if payload.get("memberId") != member_id:
            continue

        event_type = payload.get("type")
        if event_type not in CADDIE_TYPES:
            continue

        fallback_ts = payload.get("_event_ts") or payload.get("file_ts") or None
        event_ts = _coerce_ts(payload, fallback=fallback_ts)
        if event_ts is None:
            event_ts = to_ts

        # Insights operate on day granularity to ensure boundary-day events without
        # timestamps are still included.
        event_date = event_ts.date()
        if event_date < from_date or event_date > to_date:
            continue

        club = (
            payload.get("recommendedClub")
            or payload.get("selectedClub")
            or payload.get("club")
        )

        is_recent = event_ts >= recent_from_ts

        if event_type == CADDIE_ADVICE_SHOWN_V1:
            advice_shown += 1
            if isinstance(club, str):
                per_club[club]["shown"] += 1
                if is_recent:
                    per_club[club]["recent_shown"] += 1
        elif event_type == CADDIE_ADVICE_ACCEPTED_V1:
            advice_accepted += 1
            if isinstance(club, str):
                per_club[club]["accepted"] += 1
                if is_recent:
                    per_club[club]["recent_accepted"] += 1

    accept_rate = advice_accepted / advice_shown if advice_shown > 0 else None

    per_club_stats = []
    for club, stats in sorted(per_club.items()):
        total_tips = max(stats["shown"], stats["accepted"])
        per_club_stats.append(
            CaddieClubStats(
                club=club,
                shown=total_tips,
                accepted=stats["accepted"],
                ignored=max(total_tips - stats["accepted"], 0),
            )
        )

    club_insights: list[ClubInsight] = []
    for club, stats in sorted(per_club.items()):
        shown = max(stats["shown"], stats["accepted"])
        accepted = stats["accepted"]
        recent_shown = max(stats["recent_shown"], stats["recent_accepted"])
        recent_accepted = stats["recent_accepted"]

        lifetime_accept_rate = accepted / shown if shown > 0 else 0.0
        recent_accept_rate = (
            recent_accepted / recent_shown if recent_shown > 0 else lifetime_accept_rate
        )
        # Recent performance is weighted heavier to capture current behaviour trends.
        trust_score = 0.7 * recent_accept_rate + 0.3 * lifetime_accept_rate

        club_insights.append(
            ClubInsight(
                club_id=club,
                total_tips=shown,
                accepted=accepted,
                ignored=max(shown - accepted, 0),
                recent_accepted=recent_accepted,
                recent_total=recent_shown,
                trust_score=trust_score,
            )
        )

    return CaddieInsights(
        memberId=member_id,
        from_ts=from_ts,
        to_ts=to_ts,
        advice_shown=advice_shown,
        advice_accepted=advice_accepted,
        accept_rate=accept_rate,
        per_club=per_club_stats,
        recent_from_ts=recent_from_ts,
        recent_window_days=int(recency_window.total_seconds() // 86400),
        clubs=club_insights,
    )


def load_member_events(
    member_id: str, window: timedelta, *, now: datetime | None = None
) -> list[Mapping[str, object]]:
    directory = _flight_dir()
    if not directory.exists():
        return []

    to_ts = now or datetime.now(timezone.utc)
    from_ts = to_ts - window
    from_date = from_ts.date()
    to_date = to_ts.date()

    events: list[Mapping[str, object]] = []
    for path in sorted(directory.glob("flight-*.jsonl"), reverse=True):
        file_date = _extract_date_from_filename(path)
        file_ts_fallback: datetime | date | None = None
        if file_date and file_date < from_date:
            break
        if file_date:
            file_ts_fallback = datetime.combine(
                file_date, time.min, tzinfo=timezone.utc
            )
        else:
            try:
                file_ts_fallback = datetime.fromtimestamp(
                    path.stat().st_mtime, timezone.utc
                )
            except OSError:
                file_ts_fallback = None

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
                    if file_ts_fallback and "file_ts" not in merged:
                        merged["file_ts"] = file_ts_fallback
                    if merged.get("memberId") != member_id:
                        continue

                    file_fallback = merged.get("file_ts") or file_ts_fallback
                    event_ts = _coerce_ts(merged, fallback=file_fallback)
                    if event_ts:
                        merged.setdefault("_event_ts", event_ts)
                    event_date = event_ts.date() if event_ts else file_date
                    if event_date and (event_date < from_date or event_date > to_date):
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
    "ClubInsight",
    "CaddieInsights",
    "compute_caddie_insights",
    "load_member_events",
    "load_and_compute_caddie_insights",
]
