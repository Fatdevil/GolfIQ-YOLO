from typing import List

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services.sg_preview import RoundSgPreview, SgCategory
from server.services.sg_summary import aggregate_sg_previews


def _build_preview(run_id: str, sg_values: dict[SgCategory, float]) -> RoundSgPreview:
    return RoundSgPreview(
        runId=run_id,
        courseId=None,
        total_sg=sum(sg_values.values()),
        sg_by_cat=sg_values,
        holes=[],
    )


def test_aggregate_sg_previews_computes_totals() -> None:
    previews = [
        _build_preview(
            "run-1",
            {
                SgCategory.TEE: 0.5,
                SgCategory.APPROACH: 1.0,
                SgCategory.SHORT: -0.5,
                SgCategory.PUTT: 0.0,
            },
        ),
        _build_preview(
            "run-2",
            {
                SgCategory.TEE: -0.2,
                SgCategory.APPROACH: 0.3,
                SgCategory.SHORT: 0.4,
                SgCategory.PUTT: -0.1,
            },
        ),
    ]

    summary = aggregate_sg_previews("member-1", previews)

    assert summary.memberId == "member-1"
    assert summary.total_sg == pytest.approx(1.4)
    assert summary.avg_sg_per_round == pytest.approx(0.7)
    assert summary.per_category[SgCategory.TEE].total_sg == pytest.approx(0.3)
    assert summary.per_category[SgCategory.TEE].avg_sg == pytest.approx(0.15)
    assert summary.per_category[SgCategory.TEE].rounds == 2
    assert summary.per_category[SgCategory.APPROACH].avg_sg == pytest.approx(0.65)


def test_member_sg_summary_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "secret")

    async def fake_list_member_runs(member_id: str, limit: int = 5) -> List[str]:
        assert member_id == "member-123"
        assert limit == 2
        return ["run-1", "run-2"]

    fake_previews = [
        _build_preview(
            "run-1",
            {
                SgCategory.TEE: 0.5,
                SgCategory.APPROACH: 0.5,
                SgCategory.SHORT: 0.0,
                SgCategory.PUTT: 0.0,
            },
        ),
        _build_preview(
            "run-2",
            {
                SgCategory.TEE: 0.0,
                SgCategory.APPROACH: 0.5,
                SgCategory.SHORT: 0.0,
                SgCategory.PUTT: 0.0,
            },
        ),
    ]

    async def fake_load_previews(member_id: str, run_ids: List[str]):
        assert run_ids == ["run-1", "run-2"]
        assert member_id == "member-123"
        return fake_previews

    monkeypatch.setattr(
        "server.routes.sg_summary.list_member_runs", fake_list_member_runs
    )
    monkeypatch.setattr(
        "server.routes.sg_summary.load_member_sg_previews_for_runs", fake_load_previews
    )

    client = TestClient(app)
    response = client.get(
        "/api/sg/member/member-123",
        params={"limit": 2},
        headers={"x-api-key": "secret"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["memberId"] == "member-123"
    assert payload["runIds"] == ["run-1", "run-2"]
    assert payload["total_sg"] == pytest.approx(1.5)
    assert payload["avg_sg_per_round"] == pytest.approx(0.75)
    assert payload["per_category"]["APPROACH"]["avg_sg"] == pytest.approx(0.5)


def test_member_sg_summary_endpoint_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "secret")

    async def fake_list_member_runs(member_id: str, limit: int = 5) -> List[str]:
        assert member_id == "member-empty"
        assert limit == 3
        return []

    async def fake_load_previews(member_id: str, run_ids: List[str]):
        raise AssertionError("should not load previews when no runs")

    monkeypatch.setattr(
        "server.routes.sg_summary.list_member_runs", fake_list_member_runs
    )
    monkeypatch.setattr(
        "server.routes.sg_summary.load_member_sg_previews_for_runs", fake_load_previews
    )

    client = TestClient(app)
    response = client.get(
        "/api/sg/member/member-empty",
        params={"limit": 3},
        headers={"x-api-key": "secret"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "memberId": "member-empty",
        "runIds": [],
        "total_sg": 0.0,
        "avg_sg_per_round": 0.0,
        "per_category": {},
    }
