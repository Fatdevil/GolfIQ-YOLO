from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.schemas.coach_diagnosis import CoachDiagnosis, CoachFinding
from server.schemas.player_analytics import MissionStats, PlayerAnalytics
from server.services import player_analytics as analytics
from server.services.player_analytics import build_player_analytics
from server.services.sg_preview import SgCategory
from server.storage.runs import RunRecord


def _run(run_id: str, created: float, member_id: str) -> RunRecord:
    return RunRecord(
        run_id=run_id,
        created_ts=created,
        source="unit",  # type: ignore[arg-type]
        mode="quickround",
        params={"memberId": member_id},
        metrics={},
        events=[],
    )


def test_build_player_analytics_uses_recent_runs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runs = [
        _run("run-1", created=1000, member_id="member-1"),
        _run("run-2", created=2000, member_id="member-1"),
    ]

    sg_values = {
        "run-1": {
            SgCategory.TEE: -1.0,
            SgCategory.APPROACH: 0.2,
            SgCategory.SHORT: 0.1,
            SgCategory.PUTT: 0.0,
        },
        "run-2": {
            SgCategory.TEE: 0.4,
            SgCategory.APPROACH: -0.5,
            SgCategory.SHORT: 0.2,
            SgCategory.PUTT: 0.1,
        },
    }

    monkeypatch.setattr(analytics, "list_runs", lambda limit=50: runs)
    monkeypatch.setattr(analytics, "list_run_anchors", lambda run_id: [])

    def fake_preview(run_id: str, anchors, course_id=None):
        values = sg_values[run_id]
        return SimpleNamespace(total_sg=sum(values.values()), sg_by_cat=values)

    monkeypatch.setattr(analytics, "compute_sg_preview_for_run", fake_preview)

    diagnosis = CoachDiagnosis(
        run_id="run-2",
        findings=[
            CoachFinding(
                id="approach_distance_control",
                category="approach",
                severity="critical",
                title="Approach issue",
                message="",
            ),
            CoachFinding(
                id="sequence_timing",
                category="sequence",
                severity="warning",
                title="Sequence off",
                message="",
            ),
        ],
    )

    monkeypatch.setattr(analytics, "build_diagnosis_for_run", lambda run_id: diagnosis)

    result = build_player_analytics("member-1", max_runs=5)

    assert result.member_id == "member-1"
    assert [p.run_id for p in result.sg_trend] == ["run-1", "run-2"]
    assert result.best_round_id == "run-2"
    assert result.worst_round_id == "run-1"

    status = {entry.category: entry for entry in result.category_status}
    assert status["tee"].recent_trend == "improving"
    assert status["approach"].recent_trend == "worsening"
    assert status["approach"].last_severity == "critical"
    assert status["sequence"].last_severity == "focus"
    assert result.mission_stats.completed == 0


def test_player_analytics_endpoint_requires_pro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "primary")
    monkeypatch.setenv("GOLFIQ_PRO_API_KEYS", "pro-key")

    client = TestClient(app)
    response = client.get("/api/analytics/player", headers={"x-api-key": "primary"})

    assert response.status_code == 403


def test_player_analytics_endpoint_uses_member(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "primary")
    monkeypatch.setenv("GOLFIQ_PRO_API_KEYS", "pro-key")

    captured: list[str] = []

    def fake_build(member_id: str, max_runs: int = 10) -> PlayerAnalytics:
        captured.append(member_id)
        return PlayerAnalytics(
            member_id=member_id,
            sg_trend=[],
            category_status=[],
            mission_stats=MissionStats(
                total_missions=0, completed=0, completion_rate=0.0
            ),
            best_round_id=None,
            worst_round_id=None,
        )

    monkeypatch.setattr(
        "server.api.routers.analytics.build_player_analytics", fake_build
    )

    client = TestClient(app)
    response = client.get(
        "/api/analytics/player",
        headers={"x-api-key": "pro-key", "x-user-id": "member-77"},
    )

    assert response.status_code == 200
    assert captured == ["member-77"]
    assert response.json()["memberId"] == "member-77"
