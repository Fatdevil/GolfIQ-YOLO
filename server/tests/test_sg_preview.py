from __future__ import annotations

from typing import Callable, Iterable

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.schemas.anchors import AnchorOut
from server.services.sg_preview import SgCategory, compute_sg_preview_for_run
from server.storage.runs import RunRecord


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
        build_anchor(1, 1),
        build_anchor(1, 2),
        build_anchor(2, 1),
        build_anchor(2, 2),
        build_anchor(2, 3),
        build_anchor(2, 4),
    ]

    preview = compute_sg_preview_for_run(run_id, anchors, course_id="course-1")

    assert preview.runId == run_id
    assert preview.courseId == "course-1"
    assert len(preview.holes) == 2
    assert set(preview.sg_by_cat.keys()) == set(SgCategory)

    expected_totals = {
        SgCategory.TEE: 5.0,
        SgCategory.APPROACH: 1.8,
        SgCategory.SHORT: 0.5,
        SgCategory.PUTT: 1.6,
    }
    assert preview.sg_by_cat == {k: pytest.approx(v) for k, v in expected_totals.items()}
    assert preview.total_sg == pytest.approx(sum(expected_totals.values()))


def test_sg_preview_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "test-key")

    run_record = RunRecord(
        run_id="run-api",
        created_ts=0.0,
        source="test",
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

