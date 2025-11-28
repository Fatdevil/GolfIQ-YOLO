from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Iterable, List

from server.schemas.coach_diagnosis import CoachDiagnosis
from server.schemas.player_analytics import (
    CategoryStatus,
    MissionStats,
    PlayerAnalytics,
    SgTrendPoint,
)
from server.services.anchors_store import list_run as list_run_anchors
from server.services.coach_diagnostics import build_diagnosis_for_run
from server.services.sg_preview import SgCategory, compute_sg_preview_for_run
from server.storage.runs import RunRecord, list_runs

_ANALYTICS_CATEGORIES = ["tee", "approach", "short", "putt", "sequence"]


def _extract_member_id(run: RunRecord) -> str | None:
    params = run.params or {}
    metrics = run.metrics or {}
    return (
        params.get("memberId")
        or params.get("member_id")
        or metrics.get("memberId")
        or metrics.get("member_id")
    )


def _course_id_for_run(run: RunRecord) -> str | None:
    params = run.params or {}
    return params.get("courseId") or params.get("course_id")


def _select_recent_runs(member_id: str, max_runs: int) -> List[RunRecord]:
    """Return the most recent runs for a member.

    We prefer runs explicitly tagged with the member_id. If none are found we fall back
    to the latest runs overall to ensure the endpoint still returns a populated
    payload while upstream storage catches up.
    """

    recent_runs = sorted(
        list_runs(limit=max_runs * 5), key=lambda run: run.created_ts, reverse=True
    )
    matching = [run for run in recent_runs if _extract_member_id(run) == member_id]

    if matching:
        return matching[:max_runs]
    return recent_runs[:max_runs]


def _trend(values: List[float]) -> str:
    if len(values) < 2:
        return "stable"

    window = values[-3:]
    delta = window[-1] - window[0]
    if delta > 0.3:
        return "improving"
    if delta < -0.3:
        return "worsening"
    return "stable"


def _severity_from_diagnosis(diagnosis: CoachDiagnosis | None) -> Dict[str, str]:
    severity: Dict[str, str] = {cat: "ok" for cat in _ANALYTICS_CATEGORIES}
    if not diagnosis:
        return severity

    for finding in diagnosis.findings:
        category = finding.category
        if category not in severity:
            continue
        if finding.severity == "critical":
            severity[category] = "critical"
        elif finding.severity == "warning" and severity[category] != "critical":
            severity[category] = "focus"
    return severity


def _build_mission_stats() -> MissionStats:
    """Stub mission stats until backend persists session completions.

    v1 sets all mission counters to zero; the completion rate reflects the stubbed
    values to avoid dividing by zero.
    """

    return MissionStats(total_missions=0, completed=0, completion_rate=0.0)


def build_player_analytics(member_id: str, max_runs: int = 10) -> PlayerAnalytics:
    runs = _select_recent_runs(member_id, max_runs=max_runs)

    sg_trend: List[SgTrendPoint] = []

    for run in runs:
        anchors = list_run_anchors(run.run_id)
        course_id = _course_id_for_run(run)
        preview = compute_sg_preview_for_run(run.run_id, anchors, course_id=course_id)

        point = SgTrendPoint(
            run_id=run.run_id,
            date=datetime.fromtimestamp(run.created_ts, tz=timezone.utc),
            sg_total=preview.total_sg,
            sg_tee=preview.sg_by_cat.get(SgCategory.TEE, 0.0),
            sg_approach=preview.sg_by_cat.get(SgCategory.APPROACH, 0.0),
            sg_short=preview.sg_by_cat.get(SgCategory.SHORT, 0.0),
            sg_putt=preview.sg_by_cat.get(SgCategory.PUTT, 0.0),
        )
        sg_trend.append(point)

    sg_trend.sort(key=lambda p: p.date)

    per_category_values: Dict[str, List[float]] = {
        cat: [] for cat in _ANALYTICS_CATEGORIES
    }
    for point in sg_trend:
        per_category_values["tee"].append(point.sg_tee)
        per_category_values["approach"].append(point.sg_approach)
        per_category_values["short"].append(point.sg_short)
        per_category_values["putt"].append(point.sg_putt)
        # sequence is covered by diagnosis only

    diagnosis: CoachDiagnosis | None = None
    if sg_trend:
        try:
            diagnosis = build_diagnosis_for_run(sg_trend[-1].run_id)
        except Exception:
            diagnosis = None

    severity = _severity_from_diagnosis(diagnosis)

    category_status: List[CategoryStatus] = []
    for category in _ANALYTICS_CATEGORIES:
        history = per_category_values.get(category, [])
        category_status.append(
            CategoryStatus(
                category=category,
                recent_trend=_trend(history),
                last_severity=severity.get(category, "ok"),
            )
        )

    best_round_id = None
    worst_round_id = None
    if sg_trend:
        best_round_id = max(sg_trend, key=lambda p: p.sg_total).run_id
        worst_round_id = min(sg_trend, key=lambda p: p.sg_total).run_id

    return PlayerAnalytics(
        member_id=member_id,
        sg_trend=sg_trend,
        category_status=category_status,
        mission_stats=_build_mission_stats(),
        best_round_id=best_round_id,
        worst_round_id=worst_round_id,
    )


__all__ = ["build_player_analytics"]
