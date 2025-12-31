from __future__ import annotations

from typing import Callable, Iterable

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.schemas.anchors import AnchorOut
from server.services.sg_preview import SgCategory, compute_sg_preview_for_run
from server.storage.runs import RunRecord, RunSourceType, RunStatus


def _anchor_factory(run_id: str) -> Callable[[int, int], AnchorOut]:
    def _build(hole: int, shot: int) -> AnchorOut:
        return AnchorOut(
            runId=run_id,
            hole=hole,
            shot=shot,
            clipId=f"clip-{hole}-{shot}",
            tStartMs=shot * 10,
            tEndMs=shot * 10 + 5,
            version=1,
            createdTs=0,
            updatedTs=0,
        )

    return _build


def test_compute_sg_preview_groups_by_category() -> None:
    run_id = "run-preview"
    build_anchor = _anchor_factory(run_id)
    anchors: Iterable[AnchorOut] = [
        # Hole 1: tidy hole with one putt
        build_anchor(1, 1),
        build_anchor(1, 2),
        build_anchor(1, 3),
        # Hole 2: messy hole with several short-game shots
        build_anchor(2, 1),
        build_anchor(2, 2),
        build_anchor(2, 3),
        build_anchor(2, 4),
        build_anchor(2, 5),
        build_anchor(2, 6),
        build_anchor(2, 7),
        build_anchor(2, 8),
    ]

    preview = compute_sg_preview_for_run(run_id, anchors, course_id="course-1")

    assert preview.runId == run_id
    assert preview.courseId == "course-1"
    assert len(preview.holes) == 2
    assert set(preview.sg_by_cat.keys()) == set(SgCategory)

    expected_totals = {
        SgCategory.TEE: 1.0,
        SgCategory.APPROACH: 0.6,
        SgCategory.SHORT: -4.05,
        SgCategory.PUTT: 0.9,
    }
    assert preview.sg_by_cat == {
        k: pytest.approx(v) for k, v in expected_totals.items()
    }
    assert preview.total_sg == pytest.approx(sum(expected_totals.values()))
    assert preview.total_sg < 0  # round can go negative when extra strokes are taken
    assert preview.round_summary is not None
    assert preview.round_summary.worst_category == SgCategory.SHORT
    assert len(preview.round_summary.categories) == 4

    assert all(
        hole.sg_total == pytest.approx(sum(hole.sg_by_cat.values()))
        for hole in preview.holes
    )
    assert {hole.hole for hole in preview.holes} == {1, 2}
    assert preview.holes[1 - 1].gross_score == 3
    assert preview.holes[0].worst_category == SgCategory.APPROACH
    assert preview.holes[1].worst_category == SgCategory.SHORT


def test_sg_preview_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "test-key")

    run_record = RunRecord(
        run_id="run-api",
        created_ts=0.0,
        updated_ts=0.0,
        status=RunStatus.SUCCEEDED,
        source="test",
        source_type=RunSourceType.LEGACY.value,
        mode="qr",
        params={"courseId": "course-api"},
        metrics={},
        events=[],
    )

    build_anchor = _anchor_factory(run_record.run_id)
    anchors = [build_anchor(1, 1), build_anchor(1, 2)]

    monkeypatch.setattr(
        "server.routes.sg_preview.load_run",
        lambda rid: run_record if rid == run_record.run_id else None,
    )
    monkeypatch.setattr(
        "server.routes.sg_preview.list_run",
        lambda rid: anchors if rid == run_record.run_id else [],
    )

    client = TestClient(app)
    response = client.get(
        f"/api/sg/run/{run_record.run_id}", headers={"x-api-key": "test-key"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["runId"] == run_record.run_id
    assert payload["courseId"] == "course-api"
    assert payload["sg_by_cat"]["TEE"] > 0

    missing = client.get("/api/sg/run/missing", headers={"x-api-key": "test-key"})
    assert missing.status_code == 404
