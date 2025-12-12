from __future__ import annotations

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from server.rounds.models import (
    CaddieDecisionTelemetry,
    RoundCategoryStats,
    RoundInfo,
    RoundScores,
    RoundSummary,
)


class RoundRecapCategory(BaseModel):
    label: str
    grade: str | None = None
    value: float | None = None


class RoundRecap(BaseModel):
    round_id: str = Field(serialization_alias="roundId")
    course_name: str | None = Field(default=None, serialization_alias="courseName")
    date: str
    score: int | None
    to_par: str | None = Field(default=None, serialization_alias="toPar")
    holes_played: int = Field(serialization_alias="holesPlayed")
    categories: dict[str, RoundRecapCategory]
    focus_hints: list[str] = Field(
        default_factory=list, serialization_alias="focusHints"
    )
    caddie_summary: "CaddieTelemetrySummary | None" = Field(  # type: ignore
        default=None, serialization_alias="caddieSummary"
    )
    strokes_gained_light: "StrokesGainedLightSummary | None" = Field(
        default=None,
        serialization_alias="strokesGainedLight",
        validation_alias=AliasChoices("strokesGainedLight", "strokes_gained_light"),
    )

    model_config = ConfigDict(populate_by_name=True)


class CaddieTelemetrySummary(BaseModel):
    total_decisions: int = Field(serialization_alias="totalDecisions")
    followed_decisions: int = Field(serialization_alias="followedDecisions")
    follow_rate: float | None = Field(default=None, serialization_alias="followRate")
    notes: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class StrokesGainedLightCategory(BaseModel):
    category: str
    shots: int
    delta: float
    confidence: float

    model_config = ConfigDict(populate_by_name=True)


class StrokesGainedLightSummary(BaseModel):
    total_delta: float = Field(serialization_alias="totalDelta")
    by_category: list[StrokesGainedLightCategory] = Field(
        serialization_alias="byCategory"
    )
    focus_category: str | None = Field(
        default=None,
        serialization_alias="focusCategory",
        validation_alias=AliasChoices("focusCategory", "focus_category"),
    )

    model_config = ConfigDict(populate_by_name=True)


CategoryKey = Literal["driving", "approach", "short_game", "putting"]

CATEGORY_LABELS: dict[CategoryKey, str] = {
    "driving": "Driving",
    "approach": "Approach",
    "short_game": "Short Game",
    "putting": "Putting",
}

PUTT_BUCKET_LABELS: dict[str, str] = {
    "0_1m": "0–1 m",
    "1_3m": "1–3 m",
    "3_10m": "3–10 m",
    "10m_plus": "10 m+",
}


def _format_to_par(value: int | None) -> str | None:
    if value is None:
        return None
    if value == 0:
        return "E"
    prefix = "+" if value > 0 else ""
    return f"{prefix}{value}"


def _grade_from_quality(quality: float | None) -> str | None:
    if quality is None:
        return None
    if quality >= 0.75:
        return "A"
    if quality >= 0.6:
        return "B"
    if quality >= 0.45:
        return "C"
    return "D"


def _clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(max_value, value))


def _compute_putting_quality(putts_per_hole: float | None) -> float | None:
    if putts_per_hole is None:
        return None
    return _clamp(1 - ((putts_per_hole - 1.5) / 2))


def _compute_short_game_quality(short_game_per_hole: float | None) -> float | None:
    if short_game_per_hole is None:
        return None
    return _clamp(1 - ((short_game_per_hole - 0.5) / 1.5))


def _average(values: list[int]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _compute_caddie_summary(
    scores: RoundScores | None,
) -> CaddieTelemetrySummary | None:
    if scores is None:
        return None

    decisions: list[CaddieDecisionTelemetry] = []
    for hole in scores.holes.values():
        if hole.caddie_decision is not None:
            decisions.append(hole.caddie_decision)

    if not decisions:
        return None

    total = len(decisions)
    followed = [d for d in decisions if d.followed]
    not_followed = [d for d in decisions if d.followed is False]
    attack_count = sum(1 for d in decisions if d.strategy == "attack")
    layup_count = sum(1 for d in decisions if d.strategy == "layup")

    followed_scores = [
        d.resulting_score for d in followed if d.resulting_score is not None
    ]
    not_followed_scores = [
        d.resulting_score for d in not_followed if d.resulting_score is not None
    ]

    follow_rate = len(followed) / total if total else None

    notes: list[str] = []

    avg_followed = _average(followed_scores)
    avg_not_followed = _average(not_followed_scores)

    if follow_rate is not None:
        if follow_rate > 0.5:
            if (
                avg_followed is None
                or avg_not_followed is None
                or avg_followed <= avg_not_followed
            ):
                notes.append(
                    "You tended to follow the caddie and often scored better when you did."
                )
            else:
                notes.append("You tended to follow the caddie on most holes.")
        else:
            notes.append(
                "You often deviated from the caddie's plan – check if the strategy fits your game."
            )

    if attack_count or layup_count:
        notes.append(
            f"Strategies used: {attack_count} attack / {layup_count} layup decisions."
        )

    return CaddieTelemetrySummary(
        total_decisions=total,
        followed_decisions=len(followed),
        follow_rate=follow_rate,
        notes=notes,
    )


def _build_strokes_gained_light(
    summary: RoundSummary, category_stats: "RoundCategoryStats | None"
) -> StrokesGainedLightSummary:
    if category_stats is None or not summary.holes_played:
        return StrokesGainedLightSummary(total_delta=0, by_category=[], focus_category=None)

    holes = max(summary.holes_played, 0)
    baseline_per_hole = {
        "tee": 1.0,
        "approach": 2.2,
        "short_game": 0.8,
        "putting": 1.8,
    }

    actual = {
        "tee": category_stats.tee_shots,
        "approach": category_stats.approach_shots,
        "short_game": category_stats.short_game_shots,
        "putting": category_stats.putts,
    }

    by_category = []
    total_delta = 0.0
    for key, expected_per_hole in baseline_per_hole.items():
        shots = int(actual.get(key, 0) or 0)
        expected = expected_per_hole * holes
        delta = expected - shots
        confidence = min(1.0, shots / 10) if shots else 0.0
        total_delta += delta
        by_category.append(
            StrokesGainedLightCategory(
                category=key,
                shots=shots,
                delta=delta,
                confidence=confidence,
            )
        )

    focus_category: str | None = None
    eligible = [entry for entry in by_category if entry.confidence >= 0.3]
    if eligible:
        worst = min(eligible, key=lambda entry: entry.delta)
        if worst.delta <= -0.2:
            focus_category = worst.category

    return StrokesGainedLightSummary(
        total_delta=total_delta, by_category=by_category, focus_category=focus_category
    )


def _build_focus_hints(
    *,
    driving_pct: float | None,
    approach_pct: float | None,
    short_game_per_hole: float | None,
    putts_per_hole: float | None,
) -> list[str]:
    order: dict[CategoryKey, int] = {
        "driving": 0,
        "approach": 1,
        "short_game": 2,
        "putting": 3,
    }
    candidates: list[tuple[CategoryKey, float, str]] = []

    if driving_pct is not None:
        candidates.append(
            (
                "driving",
                1 - driving_pct,
                f"Work on driving accuracy – you hit {round(driving_pct * 100)}% of fairways.",
            )
        )
    if approach_pct is not None:
        candidates.append(
            (
                "approach",
                1 - approach_pct,
                f"Dial in approach shots – {round(approach_pct * 100)}% greens in regulation.",
            )
        )
    if short_game_per_hole is not None:
        candidates.append(
            (
                "short_game",
                max(short_game_per_hole - 0.6, 0.0),
                f"Short game focus – {short_game_per_hole:.1f} recovery shots per hole.",
            )
        )
    if putts_per_hole is not None:
        candidates.append(
            (
                "putting",
                max(putts_per_hole - 1.8, 0.0),
                f"Practice lag putting – {putts_per_hole:.1f} putts per hole.",
            )
        )

    candidates.sort(key=lambda item: (-item[1], order[item[0]]))

    hints = [hint for _, score, hint in candidates if score > 0.01][:3]
    if not hints and candidates:
        hints.append(candidates[0][2])
    return hints


def build_round_recap(
    round_info: RoundInfo, summary: RoundSummary, scores: RoundScores | None = None
) -> RoundRecap:
    holes = max(summary.holes_played, 0)
    driving_pct = None
    if summary.fairways_hit is not None and summary.fairways_total:
        driving_pct = summary.fairways_hit / summary.fairways_total

    approach_pct = None
    if summary.gir_count is not None and holes:
        approach_pct = summary.gir_count / holes

    putts_per_hole = None
    if summary.total_putts is not None and holes:
        putts_per_hole = summary.total_putts / holes

    short_game_per_hole = None
    if summary.short_game_shots is not None and holes:
        short_game_per_hole = summary.short_game_shots / holes

    putting_quality = _compute_putting_quality(putts_per_hole)
    short_game_quality = _compute_short_game_quality(short_game_per_hole)

    categories: dict[str, RoundRecapCategory] = {
        "driving": RoundRecapCategory(
            label=CATEGORY_LABELS["driving"],
            grade=_grade_from_quality(driving_pct),
            value=driving_pct,
        ),
        "approach": RoundRecapCategory(
            label=CATEGORY_LABELS["approach"],
            grade=_grade_from_quality(approach_pct),
            value=approach_pct,
        ),
        "short_game": RoundRecapCategory(
            label=CATEGORY_LABELS["short_game"],
            grade=_grade_from_quality(short_game_quality),
            value=short_game_per_hole,
        ),
        "putting": RoundRecapCategory(
            label=CATEGORY_LABELS["putting"],
            grade=_grade_from_quality(putting_quality),
            value=putts_per_hole,
        ),
    }

    course_name = round_info.course_name or round_info.course_id or "Unknown course"

    focus_hints = _build_focus_hints(
        driving_pct=driving_pct,
        approach_pct=approach_pct,
        short_game_per_hole=short_game_per_hole,
        putts_per_hole=putts_per_hole,
    )

    miss_counts = {
        "left": summary.fairway_miss_left or 0,
        "right": summary.fairway_miss_right or 0,
        "long": summary.fairway_miss_long or 0,
        "short": summary.fairway_miss_short or 0,
    }
    total_misses = sum(miss_counts.values())
    if total_misses and summary.fairways_total:
        dominant = max(miss_counts, key=miss_counts.get)
        if miss_counts[dominant] >= max(2, total_misses * 0.5):
            focus_hints.append(
                (
                    f"Typical miss off the tee: {dominant} "
                    f"({miss_counts[dominant]}/{summary.fairways_total} par-4/5 holes)."
                )
            )

    if summary.first_putt_bucket_three_putts:
        bucket, count = max(
            summary.first_putt_bucket_three_putts.items(), key=lambda entry: entry[1]
        )
        if count > 0:
            label = PUTT_BUCKET_LABELS.get(bucket, bucket)
            focus_hints.append(f"Most 3-putts started from {label} looks ({count}).")

    caddie_summary = _compute_caddie_summary(scores)
    sg_light = None
    try:
        from server.rounds.models import compute_round_category_stats

        stats = compute_round_category_stats(scores) if scores else None
        sg_light = _build_strokes_gained_light(summary, stats)
    except Exception:
        sg_light = None

    return RoundRecap(
        round_id=summary.round_id,
        course_name=course_name,
        date=round_info.started_at.date().isoformat(),
        score=summary.total_strokes,
        to_par=_format_to_par(summary.total_to_par),
        holes_played=holes,
        categories=categories,
        focus_hints=focus_hints,
        caddie_summary=caddie_summary,
        strokes_gained_light=sg_light,
    )


__all__ = [
    "RoundRecap",
    "RoundRecapCategory",
    "CaddieTelemetrySummary",
    "StrokesGainedLightCategory",
    "StrokesGainedLightSummary",
    "build_round_recap",
]
