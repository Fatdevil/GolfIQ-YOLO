from __future__ import annotations

from datetime import datetime, timedelta, timezone

from pydantic import BaseModel

from server.schemas.coach_diagnosis import CoachDiagnosis, CoachFinding
from server.schemas.player_analytics import (
    CategoryStatus,
    MissionStats,
    PlayerAnalytics,
    SgTrendPoint,
)
from server.schemas.player_profile import (
    DevelopmentStep,
    PlayerDevelopmentPlan,
    PlayerModel,
    PlayerProfile,
    PlayerStrength,
    PlayerWeakness,
)

DEMO_MEMBER_ID = "demo-member"


class DemoProfileResponse(BaseModel):
    profile: PlayerProfile
    analytics: PlayerAnalytics
    diagnosis: CoachDiagnosis | None = None


def _demo_sg_trend(now: datetime) -> list[SgTrendPoint]:
    base = now - timedelta(weeks=12)
    return [
        SgTrendPoint(
            run_id="demo-run-1",
            date=base,
            sg_total=-2.4,
            sg_tee=-0.8,
            sg_approach=-1.0,
            sg_short=-0.3,
            sg_putt=-0.3,
        ),
        SgTrendPoint(
            run_id="demo-run-2",
            date=base + timedelta(weeks=4),
            sg_total=-0.9,
            sg_tee=-0.2,
            sg_approach=-0.4,
            sg_short=-0.1,
            sg_putt=-0.2,
        ),
        SgTrendPoint(
            run_id="demo-run-3",
            date=base + timedelta(weeks=8),
            sg_total=0.6,
            sg_tee=0.4,
            sg_approach=0.1,
            sg_short=0.0,
            sg_putt=0.1,
        ),
        SgTrendPoint(
            run_id="demo-run-4",
            date=base + timedelta(weeks=11),
            sg_total=1.1,
            sg_tee=0.6,
            sg_approach=0.3,
            sg_short=0.2,
            sg_putt=0.0,
        ),
    ]


def _demo_category_status() -> list[CategoryStatus]:
    return [
        CategoryStatus(category="tee", recent_trend="improving", last_severity="focus"),
        CategoryStatus(
            category="approach", recent_trend="improving", last_severity="focus"
        ),
        CategoryStatus(category="short", recent_trend="stable", last_severity="ok"),
        CategoryStatus(category="putt", recent_trend="stable", last_severity="ok"),
        CategoryStatus(
            category="sequence", recent_trend="stable", last_severity="focus"
        ),
    ]


def _demo_plan() -> PlayerDevelopmentPlan:
    steps = [
        DevelopmentStep(
            week=1,
            title="Week 1 – Sharpen approach control",
            description="Dial in wedge yardages with clock system reps and half-swing calibration.",
            focus_category="approach",
            suggested_missions=["WEDGE_CLOCK_DRILL", "DISTANCE_LADDER"],
        ),
        DevelopmentStep(
            week=2,
            title="Week 2 – Sequence and tempo",
            description="Slow-motion rehearsals to reinforce hips-first transition and smoother tempo.",
            focus_category="sequence",
            suggested_missions=["TEMPO_METRONOME", "SEQUENCE_VIDEO_CHECK"],
        ),
        DevelopmentStep(
            week=3,
            title="Week 3 – Tee box confidence",
            description="Fairway finder setup with 3-wood, then reintroduce driver with alignment gates.",
            focus_category="tee",
            suggested_missions=["ALIGNMENT_STICKS", "FAIRWAY_FINDER"],
        ),
        DevelopmentStep(
            week=4,
            title="Week 4 – Convert gains on course",
            description="Play a checkpoint round focusing on pre-shot routine and smart misses.",
            focus_category="strategy",
            suggested_missions=["CHECKPOINT_ROUND", "ROUTINE_REPS"],
        ),
    ]
    return PlayerDevelopmentPlan(
        focus_categories=[step.focus_category for step in steps],
        steps=steps,
    )


def _demo_model(reference_run_id: str | None) -> PlayerModel:
    strengths = [
        PlayerStrength(
            category="short",
            title="Reliable scrambling",
            description="Up-and-down rate is trending above 55% with crisp contact on pitches.",
            evidence={"scramble_rate": 0.56},
        ),
        PlayerStrength(
            category="putt",
            title="Confident inside 6 ft",
            description="Lag putting leaves tap-ins and inside-six-foot make rate is strong.",
            evidence={"inside_6ft_make_pct": 0.72},
        ),
    ]
    weaknesses = [
        PlayerWeakness(
            category="approach",
            severity="focus",
            title="Distance control drifts long",
            description="Approach dispersion is biased long-right, especially with gap wedge.",
            evidence={"avg_miss_right_m": 6.2},
        ),
        PlayerWeakness(
            category="tee",
            severity="focus",
            title="Driver start lines leak",
            description="Club path sits right of target leading to push-fades on tighter holes.",
            evidence={"push_fade_rate": 0.32},
        ),
        PlayerWeakness(
            category="sequence",
            severity="focus",
            title="Upper-body led transition",
            description="Early shoulder turn shows up in kinematic sequence checkpoints.",
            evidence={"sequence_gap_ms": 120},
        ),
    ]
    return PlayerModel(
        player_type="Strategic grinder",
        style="Controlled-aggressive",
        strengths=strengths,
        weaknesses=weaknesses,
        consistency_score=76.0,
        development_index=64.0,
        reference_run_id=reference_run_id,
    )


def _demo_diagnosis(reference_run_id: str | None) -> CoachDiagnosis:
    return CoachDiagnosis(
        run_id=reference_run_id or "demo-run-4",
        findings=[
            CoachFinding(
                id="approach_distance_control",
                category="approach",
                severity="critical",
                title="Distance control drifts long",
                message="25–40 m approach window shows long-right bias; pause at the top to improve low-point.",
                suggested_missions=["WEDGE_CLOCK_DRILL"],
            ),
            CoachFinding(
                id="sequence_timing",
                category="sequence",
                severity="warning",
                title="Upper-body led transition",
                message="Sequence checkpoints show shoulders firing before hips. Add metronome rehearsals.",
                suggested_missions=["TEMPO_METRONOME"],
            ),
            CoachFinding(
                id="tee_start_lines",
                category="tee",
                severity="warning",
                title="Start lines leak right",
                message="Path/right face gap leads to push-fades. Close stance slightly and rehearse alignment.",
                suggested_missions=["ALIGNMENT_STICKS"],
            ),
        ],
    )


def build_demo_profile() -> DemoProfileResponse:
    now = datetime.now(timezone.utc)
    sg_trend = _demo_sg_trend(now)
    analytics = PlayerAnalytics(
        member_id=DEMO_MEMBER_ID,
        sg_trend=sg_trend,
        category_status=_demo_category_status(),
        mission_stats=MissionStats(total_missions=6, completed=3, completion_rate=0.5),
        best_round_id=sg_trend[-1].run_id,
        worst_round_id=sg_trend[0].run_id,
    )

    model = _demo_model(reference_run_id=analytics.best_round_id)
    plan = _demo_plan()
    profile = PlayerProfile(memberId=DEMO_MEMBER_ID, model=model, plan=plan)
    diagnosis = _demo_diagnosis(reference_run_id=analytics.best_round_id)

    return DemoProfileResponse(
        profile=profile, analytics=analytics, diagnosis=diagnosis
    )


__all__ = ["DemoProfileResponse", "DEMO_MEMBER_ID", "build_demo_profile"]
