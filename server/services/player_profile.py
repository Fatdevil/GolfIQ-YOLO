from __future__ import annotations

from datetime import timedelta
from statistics import mean, pstdev
from typing import Dict, Iterable, List, Literal, Sequence

from server.schemas.coach_diagnosis import CoachDiagnosis, CoachFinding
from server.schemas.player_analytics import CategoryStatus
from server.schemas.player_profile import (
    CoachCategory,
    DevelopmentStep,
    PlayerDevelopmentPlan,
    PlayerModel,
    PlayerProfile,
    PlayerStrength,
    PlayerWeakness,
)
from server.services.caddie_insights import load_and_compute_caddie_insights
from server.services.coach_diagnostics import build_diagnosis_for_run
from server.services.player_analytics import build_player_analytics
from server.storage.runs import load_run

_CATEGORY_LABELS: Dict[str, str] = {
    "tee": "Tee shots",
    "approach": "Approach",
    "short": "Short game",
    "putt": "Putting",
    "sequence": "Sequence",
    "strategy": "Strategy",
}

# Minimal mapping of focus category to backend mission identifiers, mirroring
# ``web/src/range/missions.ts``. This keeps PlayerProfile suggestions aligned
# with the range UI without a hard dependency on the frontend bundle.
_MISSION_SUGGESTIONS: Dict[CoachCategory, List[str]] = {
    "tee": ["driver_fairway_challenge"],
    "approach": ["approach_band_80_130", "mid_iron_dispersion_130_160"],
    "short": ["wedge_ladder_60_100"],
    "putt": [],
    "sequence": [],
    "strategy": [],
}


def _mean(values: Iterable[float]) -> float:
    data = list(values)
    return mean(data) if data else 0.0


def _extract_sequence_metrics(run_id: str) -> dict | None:
    run = load_run(run_id)
    if not run or not isinstance(run.metrics, dict):
        return None

    block = run.metrics.get("sequence")
    if not isinstance(block, dict):
        return None

    return {
        "max_shoulder_rotation": block.get("max_shoulder_rotation")
        or block.get("maxShoulderRotation"),
        "max_hip_rotation": block.get("max_hip_rotation")
        or block.get("maxHipRotation"),
        "max_x_factor": block.get("max_x_factor") or block.get("maxXFactor"),
        "sequence_order": block.get("sequence_order")
        or block.get("order")
        or block.get("sequenceOrder"),
        "is_ideal": block.get("is_ideal") or block.get("isIdeal"),
    }


def _severity_from_status(category_status: Sequence[CategoryStatus]) -> Dict[str, str]:
    severity: Dict[str, str] = {
        item.category: item.last_severity for item in category_status
    }
    return severity


def _severity_from_findings(findings: Sequence[CoachFinding]) -> Dict[str, str]:
    severity: Dict[str, str] = {}
    for finding in findings:
        current = severity.get(finding.category)
        if current == "critical":
            continue
        severity[finding.category] = finding.severity
    return severity


def _player_type_phrase(
    strengths: Sequence[PlayerStrength], weaknesses: Sequence[PlayerWeakness]
) -> str:
    if strengths:
        headline = ", ".join(s.title for s in strengths[:2])
    else:
        headline = "Balanced profile"

    if weaknesses:
        weak = weaknesses[0]
        return f"{headline}; needs {weak.title.lower()}"
    return headline


def _style_from_sg(avg_sg: Dict[str, float]) -> str | None:
    tee = avg_sg.get("tee", 0.0)
    approach = avg_sg.get("approach", 0.0)
    short = avg_sg.get("short", 0.0)
    putt = avg_sg.get("putt", 0.0)

    if tee > approach + 0.4:
        return "Power-first"
    if approach > tee + 0.3:
        return "Control-first"
    if short + putt > tee + approach:
        return "Touch-focused"
    return None


def _consistency_score(sg_totals: Sequence[float]) -> float | None:
    if len(sg_totals) < 2:
        return 85.0 if sg_totals else None
    spread = pstdev(sg_totals)
    score = max(40.0, 100.0 - min(spread * 12.0, 60.0))
    return round(score, 1)


def _development_index(weaknesses: Sequence[PlayerWeakness]) -> float:
    score = 100.0
    for weakness in weaknesses:
        if weakness.severity == "critical":
            score -= 18.0
        else:
            score -= 9.0
    return max(30.0, round(score, 1))


def _strengths_from_signals(
    avg_sg: Dict[str, float], severity: Dict[str, str], diagnosis: CoachDiagnosis | None
) -> List[PlayerStrength]:
    strengths: List[PlayerStrength] = []
    for category, value in avg_sg.items():
        if severity.get(category, "ok") != "ok":
            continue
        if value > 0.2:
            strengths.append(
                PlayerStrength(
                    category=category,  # type: ignore[arg-type]
                    title=f"{_CATEGORY_LABELS.get(category, category.title())} is a strength",
                    description=f"Gaining {value:.2f} SG per round recently.",
                    evidence={"avg_sg": round(value, 2)},
                )
            )

    if diagnosis:
        for finding in diagnosis.findings:
            if finding.severity == "info" and finding.category not in {
                s.category for s in strengths
            }:
                strengths.append(
                    PlayerStrength(
                        category=finding.category,
                        title=finding.title,
                        description=finding.message,
                        evidence=finding.evidence or {},
                    )
                )
    return strengths


def _weaknesses_from_signals(
    avg_sg: Dict[str, float], severity: Dict[str, str], diagnosis: CoachDiagnosis | None
) -> List[PlayerWeakness]:
    weaknesses: List[PlayerWeakness] = []
    for category, value in avg_sg.items():
        cat_severity = severity.get(category, "ok")
        if cat_severity in {"focus", "critical"} or value < -0.3:
            severity_label: Literal["focus", "critical"] = (
                "critical" if cat_severity == "critical" or value < -1.0 else "focus"
            )
            weaknesses.append(
                PlayerWeakness(
                    category=category,  # type: ignore[arg-type]
                    severity=severity_label,
                    title=f"{_CATEGORY_LABELS.get(category, category.title())} needs work",
                    description=f"Losing {abs(value):.2f} SG per round in this area.",
                    evidence={"avg_sg": round(value, 2), "severity": cat_severity},
                )
            )

    if diagnosis:
        for finding in diagnosis.findings:
            if finding.severity in {"warning", "critical"}:
                if any(w.category == finding.category for w in weaknesses):
                    continue
                severity_label: Literal["focus", "critical"] = (
                    "critical" if finding.severity == "critical" else "focus"
                )
                weaknesses.append(
                    PlayerWeakness(
                        category=finding.category,
                        severity=severity_label,
                        title=finding.title,
                        description=finding.message,
                        evidence=finding.evidence or {},
                    )
                )
    ordered = sorted(
        weaknesses,
        key=lambda w: (
            0 if w.severity == "critical" else 1,
            avg_sg.get(w.category, 0.0),
        ),
    )
    return ordered


def _plan_steps(
    weaknesses: Sequence[PlayerWeakness],
    sequence_issue: bool,
    fallback_category: CoachCategory,
) -> List[DevelopmentStep]:
    steps: List[DevelopmentStep] = []

    ordered = list(weaknesses)
    if not ordered:
        ordered.append(
            PlayerWeakness(
                category=fallback_category,
                severity="focus",
                title=f"Sharpen {_CATEGORY_LABELS.get(fallback_category, fallback_category)}",
                description="Use this month to cement your current gains.",
            )
        )

    for idx, weakness in enumerate(ordered[:2], start=1):
        steps.append(
            DevelopmentStep(
                week=idx,
                title=(
                    f"Week {idx} – "
                    f"{_CATEGORY_LABELS.get(weakness.category, weakness.category.title())}"
                ),
                description=weakness.description
                or f"Focus drills on {weakness.category} to recover strokes.",
                focusCategory=weakness.category,
                suggestedMissions=_MISSION_SUGGESTIONS.get(weakness.category, []),
            )
        )

    week_cursor = len(steps) + 1

    if sequence_issue and week_cursor <= 4:
        steps.append(
            DevelopmentStep(
                week=week_cursor,
                title="Week {0} – Kinematic sequence".format(week_cursor),
                description=(
                    "Balance hip–shoulder timing with slow-to-fast drills "
                    "and video checkpoints."
                ),
                focusCategory="sequence",
                suggestedMissions=_MISSION_SUGGESTIONS.get("sequence", []),
            )
        )
        week_cursor += 1

    if week_cursor <= 4:
        steps.append(
            DevelopmentStep(
                week=week_cursor,
                title=f"Week {week_cursor} – Strategy and consolidation",
                description=(
                    "Play a simulated round focusing on club selection and routines "
                    "to stabilise gains."
                ),
                focusCategory=fallback_category,
                suggestedMissions=_MISSION_SUGGESTIONS.get(fallback_category, []),
            )
        )
        week_cursor += 1

    while week_cursor <= 4:
        steps.append(
            DevelopmentStep(
                week=week_cursor,
                title=f"Week {week_cursor} – Keep reps steady",
                description="Repeat the highest-value drills and capture a checkpoint round.",
                focusCategory=fallback_category,
                suggestedMissions=_MISSION_SUGGESTIONS.get(fallback_category, []),
            )
        )
        week_cursor += 1

    return steps


def build_player_profile(member_id: str) -> PlayerProfile:
    analytics = build_player_analytics(member_id)
    sg_trend = analytics.sg_trend

    reference_run = sg_trend[-1].run_id if sg_trend else None

    diagnosis: CoachDiagnosis | None = None
    if reference_run:
        try:
            diagnosis = build_diagnosis_for_run(reference_run)
        except Exception:
            diagnosis = None

    severity = _severity_from_status(analytics.category_status)
    if diagnosis:
        severity.update(_severity_from_findings(diagnosis.findings))

    avg_sg: Dict[str, float] = {
        "tee": _mean(point.sg_tee for point in sg_trend),
        "approach": _mean(point.sg_approach for point in sg_trend),
        "short": _mean(point.sg_short for point in sg_trend),
        "putt": _mean(point.sg_putt for point in sg_trend),
    }

    strengths = _strengths_from_signals(avg_sg, severity, diagnosis)
    weaknesses = _weaknesses_from_signals(avg_sg, severity, diagnosis)

    sequence_issue = any(w.category == "sequence" for w in weaknesses)
    if not sequence_issue and reference_run:
        seq_metrics = _extract_sequence_metrics(reference_run)
        order = seq_metrics.get("sequence_order") if seq_metrics else None
        is_ideal = bool(seq_metrics.get("is_ideal")) if seq_metrics else True
        if seq_metrics and (
            not is_ideal or (isinstance(order, list) and order[:1] != ["hips"])
        ):
            sequence_issue = True
            weaknesses.append(
                PlayerWeakness(
                    category="sequence",
                    severity="focus",
                    title="Sequence timing can improve",
                    description=(
                        "Transition hints upper-body lead; add slow-motion reps "
                        "to groove hips-first move."
                    ),
                    evidence={"sequence_order": order},
                )
            )

    sg_totals = [point.sg_total for point in sg_trend]
    model = PlayerModel(
        playerType=_player_type_phrase(strengths, weaknesses),
        style=_style_from_sg(avg_sg),
        strengths=strengths,
        weaknesses=weaknesses,
        consistencyScore=_consistency_score(sg_totals),
        developmentIndex=_development_index(weaknesses),
        referenceRunId=reference_run,
    )
    fallback_category: CoachCategory = (
        weaknesses[0].category
        if weaknesses
        else strengths[0].category if strengths else "strategy"
    )
    steps = _plan_steps(weaknesses, sequence_issue, fallback_category)

    plan = PlayerDevelopmentPlan(
        focusCategories=[step.focus_category for step in steps],
        steps=steps,
    )

    # Optional enrichment from caddie insights — trust score trends can influence wording later.
    try:
        load_and_compute_caddie_insights(member_id, timedelta(days=30))
    except Exception:
        pass

    return PlayerProfile(memberId=member_id, model=model, plan=plan)


__all__ = ["build_player_profile"]
