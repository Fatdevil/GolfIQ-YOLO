from __future__ import annotations

from datetime import datetime, timedelta, timezone
from server.api.routers.summary import WeeklySummary
from server.services.demo_profile import DEMO_MEMBER_ID
from server.rounds.models import RoundInfo, RoundSummary
from server.rounds.recap import RoundRecap, build_round_recap
from server.rounds.weekly_summary import build_weekly_summary_response
from server.schemas.coach_summary import (
    CoachCaddieHighlight,
    CoachHoleSg,
    CoachRoundSummary,
    CoachSequenceSummary,
    CoachSgCategory,
)
from server.services.demo_profile import _demo_diagnosis, _demo_model


def _demo_round_info(run_id: str, *, days_ago: int = 3) -> RoundInfo:
    now = datetime.now(timezone.utc)
    started_at = now - timedelta(days=days_ago, hours=3)
    ended_at = started_at + timedelta(hours=4)
    return RoundInfo(
        id=run_id,
        player_id=DEMO_MEMBER_ID,
        course_id="demo-links",
        course_name="Demo Links Hero",
        tee_name="Blue",
        holes=18,
        start_hole=1,
        status="completed",
        last_hole=18,
        started_at=started_at,
        ended_at=ended_at,
    )


def _demo_round_summary(
    run_id: str, *, score: int, to_par: int, gir: int
) -> RoundSummary:
    return RoundSummary(
        round_id=run_id,
        player_id=DEMO_MEMBER_ID,
        total_strokes=score,
        total_par=72,
        total_to_par=to_par,
        front_strokes=score // 2,
        back_strokes=score - (score // 2),
        total_putts=31,
        total_penalties=2,
        tee_shots=14,
        approach_shots=22,
        short_game_shots=12,
        putting_shots=31,
        penalties=2,
        fairways_hit=9,
        fairways_total=14,
        gir_count=gir,
        holes_played=18,
    )


def build_demo_round_recap() -> RoundRecap:
    round_info = _demo_round_info("demo-round")
    summary = _demo_round_summary("demo-round", score=74, to_par=2, gir=11)
    return build_round_recap(round_info, summary)


def build_demo_weekly_summary() -> WeeklySummary:
    now = datetime.now(timezone.utc)
    primary_infos: list[RoundInfo] = [
        _demo_round_info("demo-round", days_ago=3),
        _demo_round_info("demo-round-2", days_ago=5),
        _demo_round_info("demo-round-3", days_ago=6),
    ]
    primary_summaries: list[RoundSummary] = [
        _demo_round_summary("demo-round", score=74, to_par=2, gir=11),
        _demo_round_summary("demo-round-2", score=72, to_par=0, gir=12),
        _demo_round_summary("demo-round-3", score=70, to_par=-2, gir=13),
    ]

    comparison_summaries: list[RoundSummary] = [
        _demo_round_summary("demo-round-prev-1", score=78, to_par=6, gir=8),
        _demo_round_summary("demo-round-prev-2", score=80, to_par=8, gir=7),
    ]

    payload = build_weekly_summary_response(
        summaries=primary_summaries,
        comparison_summaries=comparison_summaries,
        round_infos=primary_infos,
        now=now,
    )
    return WeeklySummary.model_validate(payload)


def build_demo_coach_round() -> CoachRoundSummary:
    round_info = _demo_round_info("demo-round", days_ago=3)
    summary = _demo_round_summary("demo-round", score=74, to_par=2, gir=11)
    sg_per_hole: list[CoachHoleSg] = [
        CoachHoleSg(hole=1, gross_score=4, sg_total=0.2, worst_category=None),
        CoachHoleSg(hole=2, gross_score=5, sg_total=-0.1, worst_category="approach"),
        CoachHoleSg(hole=3, gross_score=3, sg_total=0.4, worst_category=None),
    ]

    strokes_by_category = [
        CoachSgCategory(name="tee", sg=0.6),
        CoachSgCategory(name="approach", sg=-0.2),
        CoachSgCategory(name="short", sg=0.3),
        CoachSgCategory(name="putt", sg=0.4),
    ]

    return CoachRoundSummary(
        run_id=round_info.id,
        member_id=round_info.player_id,
        course_name=round_info.course_name,
        tees=round_info.tee_name,
        date=round_info.ended_at.date().isoformat() if round_info.ended_at else None,
        score=summary.total_strokes,
        sg_total=1.1,
        sg_by_category=strokes_by_category,
        sg_per_hole=sg_per_hole,
        sequence=CoachSequenceSummary(
            max_shoulder_rotation=88.0,
            max_hip_rotation=52.0,
            max_x_factor=36.0,
            sequence_order=["hips", "shoulders", "arms", "club"],
            is_ideal=False,
        ),
        caddie=CoachCaddieHighlight(
            trusted_club="7i",
            trusted_club_trust_score=0.82,
            ignored_club="Driver",
            ignored_club_trust_score=0.22,
        ),
        diagnosis=_demo_diagnosis(round_info.id),
        player_model=_demo_model(round_info.id),
        mission=None,
    )


__all__ = [
    "build_demo_round_recap",
    "build_demo_weekly_summary",
    "build_demo_coach_round",
]
