from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Literal

from server.rounds.models import RoundInfo, RoundSummary
from server.rounds.recap import (
    CATEGORY_LABELS,
    _build_focus_hints,
    _compute_putting_quality,
    _compute_short_game_quality,
    _grade_from_quality,
)

Trend = Literal["up", "down", "flat"]


@dataclass
class AggregatedMetrics:
    round_count: int
    avg_score: float | None
    best_score: int | None
    worst_score: int | None
    avg_to_par: float | None
    holes_played: int
    driving_pct: float | None
    approach_pct: float | None
    short_game_per_hole: float | None
    putts_per_hole: float | None


def _format_to_par(value: float | None) -> str | None:
    if value is None:
        return None
    if abs(value) < 0.005:
        return "E"
    prefix = "+" if value > 0 else ""
    rounded = float(round(value, 1))
    # Avoid trailing .0 when possible
    if rounded.is_integer():
        return f"{prefix}{int(rounded)}"
    return f"{prefix}{rounded:.1f}"


def _aggregate_summaries(summaries: list[RoundSummary]) -> AggregatedMetrics:
    strokes = [s.total_strokes for s in summaries if s.total_strokes is not None]
    to_par_values = [s.total_to_par for s in summaries if s.total_to_par is not None]

    holes_played = sum(s.holes_played or 0 for s in summaries)
    fairways_hit = sum(s.fairways_hit or 0 for s in summaries)
    fairways_total = sum(s.fairways_total or 0 for s in summaries)
    gir_total = sum(s.gir_count or 0 for s in summaries)
    short_game_total = sum(s.short_game_shots or 0 for s in summaries)
    putts_total = sum(s.total_putts or 0 for s in summaries)

    driving_pct = (fairways_hit / fairways_total) if fairways_total else None
    approach_pct = (gir_total / holes_played) if holes_played else None
    short_game_per_hole = short_game_total / holes_played if holes_played else None
    putts_per_hole = (putts_total / holes_played) if holes_played else None

    return AggregatedMetrics(
        round_count=len(summaries),
        avg_score=mean(strokes) if strokes else None,
        best_score=min(strokes) if strokes else None,
        worst_score=max(strokes) if strokes else None,
        avg_to_par=mean(to_par_values) if to_par_values else None,
        holes_played=holes_played,
        driving_pct=driving_pct,
        approach_pct=approach_pct,
        short_game_per_hole=short_game_per_hole,
        putts_per_hole=putts_per_hole,
    )


def _trend(
    current: float | None, baseline: float | None, *, threshold: float = 0.02
) -> Trend:
    if current is None or baseline is None:
        return "flat"
    delta = current - baseline
    if delta > threshold:
        return "up"
    if delta < -threshold:
        return "down"
    return "flat"


def _category_note(key: str, metrics: AggregatedMetrics) -> str | None:
    if key == "driving" and metrics.driving_pct is not None:
        return f"{metrics.driving_pct * 100:.0f}% fairways hit"
    if key == "approach" and metrics.approach_pct is not None:
        return f"{metrics.approach_pct * 100:.0f}% greens in regulation"
    if key == "short_game" and metrics.short_game_per_hole is not None:
        return f"{metrics.short_game_per_hole:.1f} recovery shots per hole"
    if key == "putting" and metrics.putts_per_hole is not None:
        return f"{metrics.putts_per_hole:.1f} putts per hole"
    return None


def _category_grade(key: str, metrics: AggregatedMetrics) -> str | None:
    if key == "driving":
        return _grade_from_quality(metrics.driving_pct)
    if key == "approach":
        return _grade_from_quality(metrics.approach_pct)
    if key == "short_game":
        quality = _compute_short_game_quality(metrics.short_game_per_hole)
        return _grade_from_quality(quality)
    if key == "putting":
        quality = _compute_putting_quality(metrics.putts_per_hole)
        return _grade_from_quality(quality)
    return None


def _build_categories(
    metrics: AggregatedMetrics, baseline: AggregatedMetrics | None
) -> dict[str, dict[str, str | None]]:
    entries: dict[str, dict[str, str | None]] = {}
    for key in CATEGORY_LABELS:
        grade = _category_grade(key, metrics)
        baseline_value = None
        current_value = None
        if key == "driving":
            baseline_value = baseline.driving_pct if baseline else None
            current_value = metrics.driving_pct
        elif key == "approach":
            baseline_value = baseline.approach_pct if baseline else None
            current_value = metrics.approach_pct
        elif key == "short_game":
            baseline_value = (
                _compute_short_game_quality(baseline.short_game_per_hole)
                if baseline
                else None
            )
            current_value = _compute_short_game_quality(metrics.short_game_per_hole)
        elif key == "putting":
            baseline_value = (
                _compute_putting_quality(baseline.putts_per_hole) if baseline else None
            )
            current_value = _compute_putting_quality(metrics.putts_per_hole)

        entries[key] = {
            "grade": grade,
            "trend": _trend(current_value, baseline_value),
            "note": _category_note(key, metrics),
        }

    return entries


def _best_and_worst_category(categories: dict[str, dict[str, str | None]]):
    order = {"A": 4, "B": 3, "C": 2, "D": 1}

    graded = [
        (key, order.get((data.get("grade") or "").replace("+", "")), data)
        for key, data in categories.items()
        if data.get("grade")
    ]
    graded = [item for item in graded if item[1] is not None]
    if not graded:
        return None, None

    best = max(graded, key=lambda item: item[1])
    worst = min(graded, key=lambda item: item[1])
    return best[0], worst[0]


def _build_headline(categories: dict[str, dict[str, str | None]]) -> tuple[str, str]:
    best, worst = _best_and_worst_category(categories)
    if best and worst and best != worst:
        return (
            f"{CATEGORY_LABELS[best]} led the way – keep lifting {CATEGORY_LABELS[worst]}",
            "🎉",
        )
    if best:
        return (
            f"Solid week! {CATEGORY_LABELS[best]} carried your scoring.",
            "🔥",
        )
    return ("Keep playing to unlock your weekly summary.", "⛳")


def _select_completed_rounds(
    rounds: list[RoundInfo],
    *,
    now: datetime,
    window_days: int = 7,
    min_rounds: int = 3,
    fallback_rounds: int = 5,
) -> list[RoundInfo]:
    completed = [r for r in rounds if r.ended_at]
    cutoff = now - timedelta(days=window_days)
    recent = [r for r in completed if r.ended_at and r.ended_at >= cutoff]
    if len(recent) >= min_rounds:
        return recent
    return completed[:fallback_rounds]


def build_weekly_summary_response(
    *,
    summaries: list[RoundSummary],
    comparison_summaries: list[RoundSummary],
    round_infos: list[RoundInfo],
    now: datetime,
) -> dict:
    if not round_infos:
        return {
            "period": {
                "from": now.date().isoformat(),
                "to": now.date().isoformat(),
                "roundCount": 0,
            },
            "headline": {
                "text": "Play a round to get your first weekly summary",
                "emoji": "⛳",
            },
            "coreStats": {
                "avgScore": None,
                "bestScore": None,
                "worstScore": None,
                "avgToPar": None,
                "holesPlayed": None,
            },
            "categories": {},
            "focusHints": [],
        }

    metrics = _aggregate_summaries(summaries)
    baseline = (
        _aggregate_summaries(comparison_summaries) if comparison_summaries else None
    )
    categories = _build_categories(metrics, baseline)
    headline_text, headline_emoji = _build_headline(categories)
    focus_hints = _build_focus_hints(
        driving_pct=metrics.driving_pct,
        approach_pct=metrics.approach_pct,
        short_game_per_hole=metrics.short_game_per_hole,
        putts_per_hole=metrics.putts_per_hole,
    )

    period_from = min(
        (info.ended_at or info.started_at or now).date() for info in round_infos
    )
    period_to = max(
        (info.ended_at or info.started_at or now).date() for info in round_infos
    )

    return {
        "period": {
            "from": period_from.isoformat(),
            "to": period_to.isoformat(),
            "roundCount": metrics.round_count,
        },
        "headline": {"text": headline_text, "emoji": headline_emoji},
        "coreStats": {
            "avgScore": metrics.avg_score,
            "bestScore": metrics.best_score,
            "worstScore": metrics.worst_score,
            "avgToPar": _format_to_par(metrics.avg_to_par),
            "holesPlayed": metrics.holes_played,
        },
        "categories": categories,
        "focusHints": focus_hints,
    }


__all__ = [
    "AggregatedMetrics",
    "Trend",
    "build_weekly_summary_response",
    "_select_completed_rounds",
]
