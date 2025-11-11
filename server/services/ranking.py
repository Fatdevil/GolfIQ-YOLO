"""Ranking helpers for top shot clips."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import log1p
from typing import Iterable, Mapping, Optional, Sequence


@dataclass(slots=True)
class RankedClip:
    clip: Mapping[str, object]
    score: float


def _parse_timestamp(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:  # pragma: no cover - defensive guard
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


def _minutes_since(timestamp: datetime | None, now: datetime) -> Optional[float]:
    if timestamp is None:
        return None
    delta = now - timestamp
    minutes = delta.total_seconds() / 60.0
    if minutes <= 0:
        return None
    return minutes


def _ensure_float(value: object, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        result = float(value)
    except (TypeError, ValueError):
        return default
    if result != result:  # NaN guard
        return default
    return result


def rank_top_shots(
    clips: Sequence[Mapping[str, object]] | Iterable[Mapping[str, object]],
    now_ts: float,
    *,
    alpha: float = 0.6,
    beta: float = 1.0,
    gamma: float = 0.3,
) -> list[dict[str, object]]:
    """Rank clips using the configured scoring formula."""

    now = datetime.fromtimestamp(float(now_ts), tz=timezone.utc)
    ranked: list[RankedClip] = []
    for clip in clips:
        r1 = _ensure_float(clip.get("reactions_1min") or clip.get("reactions1min"))
        r_total = _ensure_float(
            clip.get("reactions_total") or clip.get("reactionsTotal")
        )
        sg_delta = _ensure_float(clip.get("sg_delta") or clip.get("sgDelta"))
        created = _parse_timestamp(clip.get("created_at") or clip.get("createdAt"))
        recency_component = 0.0
        recency_minutes = _minutes_since(created, now)
        if recency_minutes is not None:
            recency_component = gamma * (1.0 / recency_minutes)
        score = (
            r1 + alpha * log1p(max(0.0, r_total)) + beta * sg_delta + recency_component
        )
        ranked.append(RankedClip(clip=clip, score=score))

    def sort_key(entry: RankedClip) -> tuple[float, float]:
        created = _parse_timestamp(
            entry.clip.get("created_at") or entry.clip.get("createdAt")
        )
        created_ts = created.timestamp() if created else 0.0
        return (entry.score, created_ts)

    ranked.sort(key=sort_key, reverse=True)

    results: list[dict[str, object]] = []
    for item in ranked:
        payload = dict(item.clip)
        payload["score"] = item.score
        results.append(payload)
    return results


__all__ = ["rank_top_shots"]
