import importlib
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from server.schemas.player_analytics import (
    CategoryStatus,
    MissionStats,
    PlayerAnalytics,
    SgTrendPoint,
)
from server.schemas.coach_diagnosis import CoachDiagnosis, CoachFinding
from server.schemas.player_profile import (
    DevelopmentStep,
    PlayerDevelopmentPlan,
    PlayerModel,
    PlayerProfile,
    PlayerStrength,
    PlayerWeakness,
)


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("GOLFIQ_PRO_API_KEYS", raising=False)


def test_build_player_profile_prioritises_weaknesses(monkeypatch):
    from server.services import player_profile as service

    now = datetime.now(timezone.utc)
    analytics = PlayerAnalytics(
        memberId="member-1",
        sgTrend=[
            SgTrendPoint(
                runId="run-1",
                date=now,
                sgTotal=-1.2,
                sgTee=0.6,
                sgApproach=-1.5,
                sgShort=-0.4,
                sgPutt=0.1,
            ),
            SgTrendPoint(
                runId="run-2",
                date=now,
                sgTotal=-0.8,
                sgTee=0.4,
                sgApproach=-1.2,
                sgShort=-0.3,
                sgPutt=0.2,
            ),
        ],
        categoryStatus=[
            CategoryStatus(category="tee", recentTrend="improving", lastSeverity="ok"),
            CategoryStatus(
                category="approach", recentTrend="worsening", lastSeverity="critical"
            ),
            CategoryStatus(
                category="short", recentTrend="stable", lastSeverity="focus"
            ),
            CategoryStatus(category="putt", recentTrend="stable", lastSeverity="ok"),
            CategoryStatus(
                category="sequence", recentTrend="stable", lastSeverity="ok"
            ),
        ],
        missionStats=MissionStats(totalMissions=0, completed=0, completionRate=0.0),
        bestRoundId="run-2",
        worstRoundId="run-1",
    )

    diagnosis = CoachDiagnosis(
        run_id="run-2",
        findings=[
            CoachFinding(
                id="approach_distance_control",
                category="approach",
                severity="critical",
                title="Approach leak",
                message="Missing distance windows",
            ),
            CoachFinding(
                id="sequence_upper_body_lead",
                category="sequence",
                severity="warning",
                title="Sequence issue",
                message="Upper body leading",
            ),
        ],
    )

    monkeypatch.setattr(
        service, "build_player_analytics", lambda member_id, max_runs=10: analytics
    )
    monkeypatch.setattr(service, "build_diagnosis_for_run", lambda run_id: diagnosis)
    monkeypatch.setattr(
        service, "load_and_compute_caddie_insights", lambda member_id, window: None
    )

    profile = service.build_player_profile("member-1")

    assert profile.member_id == "member-1"
    assert profile.model.weaknesses[0].category == "approach"
    assert any(step.focus_category == "approach" for step in profile.plan.steps[:2])
    assert len(profile.plan.steps) == 4
    assert any(strength.category == "tee" for strength in profile.model.strengths)


def test_player_profile_endpoint_requires_pro(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "primary")
    monkeypatch.setenv("GOLFIQ_PRO_API_KEYS", "pro-key")

    dummy_profile = PlayerProfile(
        memberId="member-123",
        model=PlayerModel(
            playerType="Test player",
            strengths=[PlayerStrength(category="tee", title="Tee strength")],
            weaknesses=[
                PlayerWeakness(
                    category="approach", severity="critical", title="Approach leak"
                )
            ],
            consistencyScore=80.0,
            developmentIndex=65.0,
            referenceRunId="run-1",
        ),
        plan=PlayerDevelopmentPlan(
            focusCategories=["approach"],
            steps=[
                DevelopmentStep(
                    week=1,
                    title="Week 1",
                    description="Fix approach",
                    focusCategory="approach",
                    suggestedMissions=["approach_band_80_130"],
                )
            ],
        ),
    )

    import server.api.routers.profile as profile_router

    importlib.reload(profile_router)
    monkeypatch.setattr(
        profile_router, "build_player_profile", lambda member_id: dummy_profile
    )

    import server.app as fastapi_app

    importlib.reload(fastapi_app)

    client = TestClient(fastapi_app.app, raise_server_exceptions=False)

    ok = client.get("/api/profile/player", headers={"x-api-key": "pro-key"})
    assert ok.status_code == 200

    blocked = client.get("/api/profile/player", headers={"x-api-key": "primary"})
    assert blocked.status_code == 403
