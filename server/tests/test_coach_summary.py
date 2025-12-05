from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.coach import DRILL_CATALOG
from server.schemas.anchors import AnchorIn


@pytest.fixture(autouse=True)
def reset_anchors():
    from server.services import anchors_store

    anchors_store._reset_state()
    yield
    anchors_store._reset_state()


@pytest.fixture
def runs_module(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    from server.storage import runs as runs_mod

    module = importlib.reload(runs_mod)
    yield module
    importlib.reload(runs_mod)


def _reload_coach_summary():
    from server.services import coach_summary as module

    return importlib.reload(module)


def test_build_coach_summary_merges_sources(monkeypatch, runs_module):
    from server.services.caddie_insights import CaddieInsights, ClubInsight

    run = runs_module.save_run(
        source="app",
        mode="play",
        params={
            "courseName": "Test Course",
            "courseId": "course-1",
            "memberId": "member-123",
            "teesName": "Blue",
            "missionId": "wedge_ladder_60_100",
        },
        metrics={
            "sequence": {
                "max_shoulder_rotation": 80,
                "max_hip_rotation": 45,
                "max_x_factor": 35,
                "sequence_order": ["hips", "shoulders", "arms", "club"],
                "is_ideal": True,
            }
        },
        events=[],
    )

    from server.services import anchors_store

    anchors_store.create_or_confirm(
        run.run_id, AnchorIn(hole=1, shot=1, clipId="c1", tStartMs=0, tEndMs=10)
    )
    anchors_store.create_or_confirm(
        run.run_id, AnchorIn(hole=1, shot=2, clipId="c2", tStartMs=10, tEndMs=20)
    )
    anchors_store.create_or_confirm(
        run.run_id, AnchorIn(hole=2, shot=1, clipId="c3", tStartMs=0, tEndMs=10)
    )

    coach_summary = _reload_coach_summary()

    fake_insights = CaddieInsights(
        memberId="member-123",
        from_ts=datetime.now(timezone.utc) - timedelta(days=30),
        to_ts=datetime.now(timezone.utc),
        advice_shown=4,
        advice_accepted=2,
        accept_rate=0.5,
        per_club=[],
        clubs=[
            ClubInsight(
                club_id="7i",
                total_tips=3,
                accepted=2,
                ignored=1,
                recent_accepted=2,
                recent_total=3,
                trust_score=0.66,
            ),
            ClubInsight(
                club_id="driver",
                total_tips=1,
                accepted=0,
                ignored=1,
                recent_accepted=0,
                recent_total=1,
                trust_score=0.0,
            ),
        ],
    )
    monkeypatch.setattr(
        coach_summary,
        "load_and_compute_caddie_insights",
        lambda member_id, window: fake_insights,
    )

    summary = coach_summary.build_coach_summary_for_run(run.run_id)

    assert summary.run_id == run.run_id
    assert summary.course_name == "Test Course"
    assert summary.tees == "Blue"
    assert summary.sg_total is not None
    assert summary.sg_by_category
    assert summary.sg_per_hole[0].hole == 1
    assert summary.sequence is not None
    assert summary.sequence.sequence_order == ["hips", "shoulders", "arms", "club"]
    assert summary.caddie is not None
    assert summary.caddie.trusted_club == "7i"
    assert summary.mission is not None
    assert summary.mission.mission_label == "Wedge ladder 60–100 m"
    assert summary.recommended_drills

    catalog_ids = {drill["id"] for drill in DRILL_CATALOG}
    assert all(drill.id in catalog_ids for drill in summary.recommended_drills)


def test_coach_round_summary_endpoint_requires_pro(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "primary")
    monkeypatch.setenv("GOLFIQ_PRO_API_KEYS", "pro-key")

    coach_summary = _reload_coach_summary()
    dummy_summary = coach_summary.CoachRoundSummary(run_id="demo")
    monkeypatch.setattr(
        coach_summary,
        "build_coach_summary_for_run",
        lambda run_id, _api_key=None: dummy_summary,
    )

    from server.api.routers import coach as coach_router

    importlib.reload(coach_router)
    import server.app as fastapi_app

    importlib.reload(fastapi_app)

    client = TestClient(fastapi_app.app, raise_server_exceptions=False)

    ok = client.get("/api/coach/round-summary/demo", headers={"x-api-key": "pro-key"})
    assert ok.status_code == 200

    blocked = client.get(
        "/api/coach/round-summary/demo", headers={"x-api-key": "primary"}
    )
    assert blocked.status_code == 403
