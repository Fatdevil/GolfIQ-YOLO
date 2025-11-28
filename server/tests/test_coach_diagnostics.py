import importlib

import pytest

from server.schemas.anchors import AnchorIn
from server.schemas.coach_diagnosis import CoachDiagnosis


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


def _make_preview(run_id, sg_by_cat, holes=None):
    from server.services.sg_preview import HoleSgPreview, RoundSgPreview

    return RoundSgPreview(
        runId=run_id,
        courseId=None,
        total_sg=sum(sg_by_cat.values()),
        sg_by_cat=sg_by_cat,
        holes=holes or [],
        round_summary=None,
    )


def test_builds_tee_and_approach_findings(monkeypatch, runs_module):
    from server.services.sg_preview import SgCategory
    from server.services import coach_diagnostics

    run = runs_module.save_run(
        source="app",
        mode="play",
        params={},
        metrics={},
        events=[],
    )

    from server.services import anchors_store

    anchors_store.create_or_confirm(
        run.run_id, AnchorIn(hole=1, shot=1, clipId="c1", tStartMs=0, tEndMs=10)
    )

    preview = _make_preview(
        run.run_id,
        {
            SgCategory.TEE: -2.6,
            SgCategory.APPROACH: -1.4,
            SgCategory.SHORT: 0.2,
            SgCategory.PUTT: -0.3,
        },
    )

    monkeypatch.setattr(
        coach_diagnostics, "compute_sg_preview_for_run", lambda *args, **kwargs: preview
    )
    monkeypatch.setattr(
        coach_diagnostics,
        "load_and_compute_caddie_insights",
        lambda *args, **kwargs: None,
    )

    diagnosis = coach_diagnostics.build_diagnosis_for_run(run.run_id)

    ids = {finding.id for finding in diagnosis.findings}
    assert "tee_inconsistency" in ids
    assert "approach_distance_control" in ids


def test_sequence_flags_upper_body_lead(monkeypatch, runs_module):
    from server.services.sg_preview import SgCategory
    from server.services import coach_diagnostics

    run = runs_module.save_run(
        source="app",
        mode="play",
        params={},
        metrics={
            "sequence": {
                "max_shoulder_rotation": 80,
                "max_hip_rotation": 40,
                "max_x_factor": 15,
                "sequence_order": ["shoulders", "arms", "hips", "club"],
                "is_ideal": False,
            }
        },
        events=[],
    )

    preview = _make_preview(
        run.run_id,
        {
            SgCategory.TEE: -0.6,
            SgCategory.APPROACH: -0.8,
            SgCategory.SHORT: 0.1,
            SgCategory.PUTT: 0.0,
        },
    )

    monkeypatch.setattr(
        coach_diagnostics, "compute_sg_preview_for_run", lambda *args, **kwargs: preview
    )
    monkeypatch.setattr(
        coach_diagnostics,
        "load_and_compute_caddie_insights",
        lambda *args, **kwargs: None,
    )

    diagnosis = coach_diagnostics.build_diagnosis_for_run(run.run_id)
    ids = {finding.id for finding in diagnosis.findings}
    assert "sequence_upper_body_lead" in ids
    assert any(f.evidence.get("hip_rotation") == 40 for f in diagnosis.findings)


def test_coach_summary_includes_diagnosis(monkeypatch, runs_module):
    from server.services import coach_summary

    run = runs_module.save_run(
        source="app",
        mode="play",
        params={"courseName": "Demo", "memberId": "member-1"},
        metrics={},
        events=[],
    )

    fake_diagnosis = CoachDiagnosis(run_id=run.run_id, findings=[])
    monkeypatch.setattr(
        coach_summary, "build_diagnosis_for_run", lambda run_id: fake_diagnosis
    )

    from server.services.sg_preview import RoundSgPreview, SgCategory

    dummy_preview = RoundSgPreview(
        runId=run.run_id,
        courseId=None,
        total_sg=0.0,
        sg_by_cat={cat: 0.0 for cat in SgCategory},
        holes=[],
        round_summary=None,
    )
    monkeypatch.setattr(
        coach_summary,
        "compute_sg_preview_for_run",
        lambda *args, **kwargs: dummy_preview,
    )

    result = coach_summary.build_coach_summary_for_run(run.run_id)
    assert result.diagnosis is fake_diagnosis
