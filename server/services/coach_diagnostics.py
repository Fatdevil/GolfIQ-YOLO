from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from statistics import pstdev
from typing import Any, Iterable, Sequence

from fastapi import HTTPException, status

from server.schemas.coach_diagnosis import CoachDiagnosis, CoachFinding
from server.services.anchors_store import list_run
from server.services.caddie_insights import (
    ClubInsight,
    load_and_compute_caddie_insights,
)
from server.services.sg_preview import (
    HoleSgPreview,
    RoundSgPreview,
    SgCategory,
    compute_sg_preview_for_run,
)
from server.storage.runs import RunRecord, load_run


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _coerce_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return None


@dataclass
class SequenceMetrics:
    max_shoulder_rotation: float | None
    max_hip_rotation: float | None
    max_x_factor: float | None
    sequence_order: list[str]
    is_ideal: bool


def _extract_sequence_metrics(metrics: dict[str, Any] | None) -> SequenceMetrics | None:
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
        or []
    )
    sequence_order: list[str] = (
        [str(item) for item in order_raw] if isinstance(order_raw, Sequence) else []
    )
    is_ideal = _coerce_bool(metrics.get("is_ideal") or metrics.get("isIdeal")) or False

    if (
        not sequence_order
        or max_shoulder is None
        or max_hip is None
        or max_x_factor is None
    ):
        return None

    return SequenceMetrics(
        max_shoulder_rotation=max_shoulder,
        max_hip_rotation=max_hip,
        max_x_factor=max_x_factor,
        sequence_order=sequence_order,
        is_ideal=is_ideal,
    )


@dataclass
class DiagnosisContext:
    run: RunRecord
    sg_preview: RoundSgPreview
    sequence: SequenceMetrics | None
    caddie_clubs: list[ClubInsight] | None

    @property
    def sg_by_category(self) -> dict[SgCategory, float]:
        return self.sg_preview.sg_by_cat

    @property
    def holes(self) -> Sequence[HoleSgPreview]:
        return self.sg_preview.holes


def _worst_holes_for_category(
    holes: Iterable[HoleSgPreview], category: SgCategory, limit: int = 3
) -> list[dict[str, Any]]:
    pairs = []
    for hole in holes:
        value = hole.sg_by_cat.get(category)
        if value is None:
            continue
        pairs.append((hole.hole, value))
    pairs.sort(key=lambda item: item[1])
    return [{"hole": hole, "sg": round(value, 2)} for hole, value in pairs[:limit]]


def _tee_inconsistency(ctx: DiagnosisContext) -> CoachFinding | None:
    sg_tee = ctx.sg_by_category.get(SgCategory.TEE)
    if sg_tee is None or sg_tee > -1.2:
        return None

    severity = "critical" if sg_tee <= -3.0 else "warning"
    worst_holes = _worst_holes_for_category(ctx.holes, SgCategory.TEE)

    return CoachFinding(
        id="tee_inconsistency",
        category="tee",
        severity=severity,
        title="Tee game is costing you strokes",
        message=(
            "Several tee shots lost strokes — tighten dispersion and club selection off the tee."
        ),
        evidence={"sg_tee": round(sg_tee, 2), "worst_holes": worst_holes},
        suggested_missions=["driver_fairway_challenge"],
        suggested_focus=["tee_consistency"],
    )


def _approach_control(ctx: DiagnosisContext) -> CoachFinding | None:
    sg_app = ctx.sg_by_category.get(SgCategory.APPROACH)
    if sg_app is None or sg_app > -1.0:
        return None

    severity = "critical" if sg_app <= -2.5 else "warning"
    worst_holes = _worst_holes_for_category(ctx.holes, SgCategory.APPROACH)

    return CoachFinding(
        id="approach_distance_control",
        category="approach",
        severity=severity,
        title="Approach distance control is off",
        message=(
            "Approach shots are giving up strokes — focus on consistent carry windows from"
            " 80–130 m."
        ),
        evidence={"sg_approach": round(sg_app, 2), "worst_holes": worst_holes},
        suggested_missions=["approach_band_80_130", "mid_iron_dispersion_130_160"],
        suggested_focus=["approach_distance_control"],
    )


def _short_game_leak(ctx: DiagnosisContext) -> CoachFinding | None:
    sg_short = ctx.sg_by_category.get(SgCategory.SHORT)
    if sg_short is None:
        return None

    min_cat = min(ctx.sg_by_category.items(), key=lambda item: item[1])[0]
    if min_cat is not SgCategory.SHORT or sg_short > -0.8:
        return None

    severity = "critical" if sg_short <= -2.0 else "warning"
    worst_holes = _worst_holes_for_category(ctx.holes, SgCategory.SHORT)

    return CoachFinding(
        id="short_game_leak",
        category="short",
        severity=severity,
        title="Short game is the biggest leak",
        message=(
            "Around-the-green shots are dropping strokes. Prioritise landing spot control and"
            " simple bump-and-runs."
        ),
        evidence={"sg_short": round(sg_short, 2), "worst_holes": worst_holes},
        suggested_missions=["wedge_ladder_60_100"],
        suggested_focus=["short_game_contact"],
    )


def _putting_variance(ctx: DiagnosisContext) -> CoachFinding | None:
    sg_putt = ctx.sg_by_category.get(SgCategory.PUTT)
    per_hole = [
        hole.sg_by_cat.get(SgCategory.PUTT)
        for hole in ctx.holes
        if hole.sg_by_cat.get(SgCategory.PUTT) is not None
    ]
    if sg_putt is None or not per_hole:
        return None

    spread = pstdev(per_hole) if len(per_hole) > 1 else 0.0
    if sg_putt > -0.4 or spread < 0.8:
        return None

    severity = "warning" if sg_putt > -1.5 else "critical"
    return CoachFinding(
        id="putting_variance",
        category="putt",
        severity=severity,
        title="Putting consistency is low",
        message=(
            "Putting shows large swings per hole. Focus on speed control and start line on"
            " second putts."
        ),
        evidence={"sg_putt": round(sg_putt, 2), "stdev": round(spread, 2)},
        suggested_focus=["putting_speed_control"],
    )


def _sequence_upper_body_lead(ctx: DiagnosisContext) -> CoachFinding | None:
    seq = ctx.sequence
    if not seq:
        return None

    hips_first = bool(seq.sequence_order and seq.sequence_order[0] == "hips")
    hip_rotation = seq.max_hip_rotation or 0.0
    shoulder_rotation = seq.max_shoulder_rotation or 0.0

    if hips_first and seq.is_ideal:
        return None

    if hip_rotation <= 0 or shoulder_rotation <= 0:
        return None

    hip_to_shoulder_ratio = (
        hip_rotation / shoulder_rotation if shoulder_rotation else 0.0
    )
    if hip_to_shoulder_ratio >= 0.8 and hips_first:
        return None

    severity = "warning" if hip_to_shoulder_ratio >= 0.6 else "critical"
    return CoachFinding(
        id="sequence_upper_body_lead",
        category="sequence",
        severity=severity,
        title="Upper body is leading the downswing",
        message=(
            "Shoulders/arms are peaking before the hips. Sequence hips first to unlock"
            " speed and consistency."
        ),
        evidence={
            "sequence_order": seq.sequence_order,
            "hip_rotation": round(hip_rotation, 2),
            "shoulder_rotation": round(shoulder_rotation, 2),
        },
        suggested_focus=["sequence_hips_first"],
    )


def _sequence_low_x_factor(ctx: DiagnosisContext) -> CoachFinding | None:
    seq = ctx.sequence
    if not seq:
        return None

    sg_tee = ctx.sg_by_category.get(SgCategory.TEE, 0.0)
    sg_app = ctx.sg_by_category.get(SgCategory.APPROACH, 0.0)
    if seq.max_x_factor is None or (sg_tee > -0.5 and sg_app > -0.5):
        return None

    if seq.max_x_factor >= 20.0:
        return None

    severity = "warning"
    return CoachFinding(
        id="sequence_low_x_factor",
        category="sequence",
        severity=severity,
        title="Limited hip–shoulder separation",
        message=(
            "Low X-factor combined with tee/approach leaks suggests passive hips. Work on"
            " creating more separation in transition."
        ),
        evidence={
            "max_x_factor": round(seq.max_x_factor, 2),
            "sg_tee": round(sg_tee, 2),
            "sg_approach": round(sg_app, 2),
        },
        suggested_focus=["sequence_separation"],
    )


def _caddie_trust_mismatch(ctx: DiagnosisContext) -> CoachFinding | None:
    clubs = ctx.caddie_clubs or []
    if not clubs:
        return None

    low_trust = [
        club for club in clubs if club.total_tips >= 3 and club.trust_score < 0.35
    ]
    if not low_trust:
        return None

    club = sorted(low_trust, key=lambda item: item.trust_score)[0]
    severity = "warning" if club.trust_score >= 0.2 else "critical"

    return CoachFinding(
        id="caddie_trust_mismatch",
        category="strategy",
        severity=severity,
        title="Caddie advice often ignored",
        message=(
            f"{club.club_id} tips are often dismissed. Revisit target strategy or bag"
            " setup for this club."
        ),
        evidence={
            "club_id": club.club_id,
            "trust_score": round(club.trust_score, 2),
            "total_tips": club.total_tips,
            "accepted": club.accepted,
        },
        suggested_focus=["caddie_trust_review"],
    )


RULES = [
    _tee_inconsistency,
    _approach_control,
    _short_game_leak,
    _putting_variance,
    _sequence_upper_body_lead,
    _sequence_low_x_factor,
    _caddie_trust_mismatch,
]


def _build_context(run_id: str) -> DiagnosisContext:
    run = load_run(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Unknown run_id"
        )

    anchors = list_run(run_id)
    course_id = (run.params or {}).get("courseId") or (run.params or {}).get(
        "course_id"
    )
    sg_preview = compute_sg_preview_for_run(run_id, anchors, course_id=course_id)

    sequence_metrics = (
        _extract_sequence_metrics((run.metrics or {}).get("sequence"))
        if isinstance(run.metrics, dict)
        else None
    )

    member_id = (
        (run.params or {}).get("memberId")
        or (run.params or {}).get("member_id")
        or (run.metrics or {}).get("memberId")
    )
    caddie_clubs: list[ClubInsight] | None = None
    if member_id:
        try:
            insights = load_and_compute_caddie_insights(member_id, timedelta(days=30))
            caddie_clubs = insights.clubs or None
        except Exception:
            caddie_clubs = None

    return DiagnosisContext(
        run=run,
        sg_preview=sg_preview,
        sequence=sequence_metrics,
        caddie_clubs=caddie_clubs,
    )


def build_diagnosis_for_run(run_id: str) -> CoachDiagnosis:
    ctx = _build_context(run_id)

    findings: dict[str, CoachFinding] = {}
    for rule in RULES:
        finding = rule(ctx)
        if not finding:
            continue
        findings.setdefault(finding.id, finding)

    ordered = sorted(
        findings.values(),
        key=lambda f: {"critical": 0, "warning": 1, "info": 2}[f.severity],
    )
    return CoachDiagnosis(run_id=ctx.run.run_id, findings=ordered)


__all__ = ["build_diagnosis_for_run"]
