from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

from fastapi import HTTPException, status

from server.schemas.coach_summary import (
    CoachCaddieHighlight,
    CoachDiagnosis,
    CoachHoleSg,
    CoachMissionSummary,
    CoachRoundSummary,
    CoachSequenceSummary,
    CoachSgCategory,
)
from server.services.coach_diagnostics import build_diagnosis_for_run
from server.services.anchors_store import list_run
from server.services.caddie_insights import (
    ClubInsight,
    load_and_compute_caddie_insights,
)
from server.services.sg_preview import SgCategory, compute_sg_preview_for_run
from server.storage.runs import RunRecord, load_run

MISSION_LABELS = {
    "wedge_ladder_60_100": "Wedge ladder 60–100 m",
    "approach_band_80_130": "Approach band 80–130 m",
    "mid_iron_dispersion_130_160": "Mid-iron dispersion 130–160 m",
    "driver_fairway_challenge": "Driver fairway challenge",
}


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def _extract_member_id(run: RunRecord) -> str | None:
    candidates = run.params or {}
    return (
        candidates.get("memberId")
        or candidates.get("member_id")
        or run.metrics.get("memberId")
        or run.metrics.get("member_id")
    )


def _extract_course_id(run: RunRecord) -> str | None:
    params = run.params or {}
    return params.get("courseId") or params.get("course_id")


def _extract_course_name(run: RunRecord) -> str | None:
    params = run.params or {}
    return params.get("courseName") or params.get("course_name")


def _extract_tees(run: RunRecord) -> str | None:
    params = run.params or {}
    return params.get("teesName") or params.get("tees") or params.get("tee")


def _extract_score(run: RunRecord, gross_scores: Iterable[int]) -> int | None:
    params = run.params or {}
    score = _coerce_int(params.get("score") or run.metrics.get("score"))
    if score is not None:
        return score

    total = sum(gross_scores)
    return total if total > 0 else None


def _build_sequence_summary(
    metrics: dict[str, Any] | None,
) -> CoachSequenceSummary | None:
    if not isinstance(metrics, dict):
        return None

    max_shoulder = _coerce_float(
        metrics.get("max_shoulder_rotation") or metrics.get("maxShoulderRotation")
    )
    max_hip = _coerce_float(
        metrics.get("max_hip_rotation") or metrics.get("maxHipRotation")
    )
    max_x_factor = _coerce_float(
        metrics.get("max_x_factor") or metrics.get("maxXFactor")
    )

    order_raw = (
        metrics.get("sequence_order")
        or metrics.get("order")
        or metrics.get("sequenceOrder")
    )
    sequence_order: list[str] | None = None
    if isinstance(order_raw, Sequence) and not isinstance(order_raw, (str, bytes)):
        sequence_order = [str(item) for item in order_raw]

    if (
        max_shoulder is None
        or max_hip is None
        or max_x_factor is None
        or not sequence_order
    ):
        return None

    is_ideal_raw = metrics.get("is_ideal") or metrics.get("isIdeal")
    is_ideal = bool(is_ideal_raw) if isinstance(is_ideal_raw, (bool, int)) else False

    return CoachSequenceSummary(
        max_shoulder_rotation=max_shoulder,
        max_hip_rotation=max_hip,
        max_x_factor=max_x_factor,
        sequence_order=sequence_order,
        is_ideal=is_ideal,
    )


def _best_and_worst_trusted_clubs(
    clubs: list[ClubInsight],
) -> CoachCaddieHighlight | None:
    valid = [club for club in clubs if isinstance(club.trust_score, (int, float))]
    if not valid:
        return None

    sorted_clubs = sorted(valid, key=lambda club: club.trust_score)
    least = sorted_clubs[0]
    most = sorted_clubs[-1]

    return CoachCaddieHighlight(
        trusted_club=most.club_id,
        trusted_club_trust_score=most.trust_score,
        ignored_club=least.club_id,
        ignored_club_trust_score=least.trust_score,
    )


def _build_caddie_highlight(member_id: str | None) -> CoachCaddieHighlight | None:
    if not member_id:
        return None

    try:
        insights = load_and_compute_caddie_insights(member_id, timedelta(days=30))
    except Exception:
        return None
    clubs = insights.clubs
    if not clubs and insights.per_club:
        clubs = [
            ClubInsight(
                club_id=club.club,
                total_tips=club.shown,
                accepted=club.accepted,
                ignored=club.ignored or max(club.shown - club.accepted, 0),
                recent_accepted=club.accepted,
                recent_total=club.shown,
                trust_score=(club.accepted / club.shown) if club.shown else 0.0,
            )
            for club in insights.per_club
        ]

    return _best_and_worst_trusted_clubs(clubs)


def _build_mission_summary(run: RunRecord) -> CoachMissionSummary | None:
    params = run.params or {}
    metrics = run.metrics or {}

    mission_block = metrics.get("mission") if isinstance(metrics, dict) else None
    mission_id = params.get("missionId") or params.get("mission_id")
    mission_success = None
    mission_label = None

    if isinstance(mission_block, dict):
        mission_id = mission_block.get("id") or mission_id
        mission_label = mission_block.get("label")
        raw_success = mission_block.get("success")
        if isinstance(raw_success, bool):
            mission_success = raw_success

    mission_label = mission_label or MISSION_LABELS.get(mission_id)
    success_flag = mission_success
    if success_flag is None and isinstance(metrics.get("mission_success"), bool):
        success_flag = bool(metrics.get("mission_success"))

    if not (mission_id or mission_label or success_flag is not None):
        return None

    return CoachMissionSummary(
        mission_id=mission_id,
        mission_label=mission_label,
        success=success_flag,
    )


def build_coach_summary_for_run(
    run_id: str, *, _api_key: str | None = None
) -> CoachRoundSummary:
    run = load_run(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown run_id"
        )

    anchors = list_run(run_id)
    course_id = _extract_course_id(run)
    sg_preview = compute_sg_preview_for_run(run_id, anchors, course_id=course_id)

    member_id = _extract_member_id(run)
    course_name = _extract_course_name(run)
    tees = _extract_tees(run)
    date_iso = datetime.fromtimestamp(run.created_ts, tz=timezone.utc).isoformat()

    sg_by_category = [
        CoachSgCategory(
            name=category.value.lower(), sg=sg_preview.sg_by_cat.get(category, 0.0)
        )
        for category in SgCategory
    ]

    sg_per_hole = [
        CoachHoleSg(
            hole=hole.hole,
            gross_score=hole.gross_score,
            sg_total=hole.sg_total,
            worst_category=(
                hole.worst_category.value.lower() if hole.worst_category else None
            ),
        )
        for hole in sg_preview.holes
    ]

    score = _extract_score(run, (hole.gross_score for hole in sg_preview.holes))

    sequence_summary = _build_sequence_summary(
        run.metrics.get("sequence") if isinstance(run.metrics, dict) else None
    )
    caddie_highlight = _build_caddie_highlight(member_id)
    mission_summary = _build_mission_summary(run)
    diagnosis: CoachDiagnosis | None = None

    try:
        diagnosis = build_diagnosis_for_run(run_id)
    except HTTPException:
        raise
    except Exception:
        diagnosis = None

    return CoachRoundSummary(
        run_id=run.run_id,
        member_id=member_id,
        course_name=course_name,
        tees=tees,
        date=date_iso,
        score=score,
        sg_total=sg_preview.total_sg,
        sg_by_category=sg_by_category,
        sg_per_hole=sg_per_hole,
        sequence=sequence_summary,
        caddie=caddie_highlight,
        mission=mission_summary,
        diagnosis=diagnosis,
    )


__all__ = [
    "CoachRoundSummary",
    "build_coach_summary_for_run",
]
