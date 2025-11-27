from __future__ import annotations

from typing import Dict, Iterable, List

from pydantic import BaseModel
from server.services.anchors_store import list_run as list_run_anchors
from server.services.sg_preview import (
    RoundSgPreview,
    SgCategory,
    compute_sg_preview_for_run,
)
from server.storage.runs import list_runs, load_run


class MemberSgCategorySummary(BaseModel):
    category: SgCategory
    total_sg: float
    avg_sg: float
    rounds: int


class MemberSgSummary(BaseModel):
    memberId: str
    runIds: List[str]
    total_sg: float
    avg_sg_per_round: float
    per_category: Dict[SgCategory, MemberSgCategorySummary]


def aggregate_sg_previews(
    member_id: str,
    previews: Iterable[RoundSgPreview],
) -> MemberSgSummary:
    previews = list(previews)
    run_ids = [p.runId for p in previews]
    rounds_count = len(previews) or 1

    cat_totals: Dict[SgCategory, float] = {cat: 0.0 for cat in SgCategory}
    cat_round_counts: Dict[SgCategory, int] = {cat: 0 for cat in SgCategory}

    total_sg = 0.0

    for preview in previews:
        total_sg += preview.total_sg
        for cat, value in preview.sg_by_cat.items():
            cat_totals[cat] += value
            cat_round_counts[cat] += 1

    per_category: Dict[SgCategory, MemberSgCategorySummary] = {}
    for cat in SgCategory:
        total_cat = cat_totals[cat]
        rounds_cat = cat_round_counts[cat] or rounds_count
        per_category[cat] = MemberSgCategorySummary(
            category=cat,
            total_sg=total_cat,
            avg_sg=total_cat / rounds_cat,
            rounds=cat_round_counts[cat],
        )

    return MemberSgSummary(
        memberId=member_id,
        runIds=run_ids,
        total_sg=total_sg,
        avg_sg_per_round=total_sg / rounds_count,
        per_category=per_category,
    )


def _course_id_from_run(run) -> str | None:
    if not run or not run.params:
        return None
    return run.params.get("courseId") or run.params.get("course_id")


async def load_member_sg_previews_for_runs(
    member_id: str,
    run_ids: List[str],
) -> List[RoundSgPreview]:
    previews: List[RoundSgPreview] = []
    for run_id in run_ids:
        run = load_run(run_id)
        anchors = list_run_anchors(run_id)
        course_id = _course_id_from_run(run)
        previews.append(
            compute_sg_preview_for_run(run_id, anchors, course_id=course_id)
        )
    return previews


async def list_member_runs(member_id: str, limit: int = 5) -> List[str]:
    """List recent runs for a member.

    v1 does not persist member->run mappings; we use recent runs regardless of member
    identity to keep the endpoint functional while we wire up richer storage.
    """

    _ = member_id  # placeholder until member-aware storage is wired
    return [run.run_id for run in list_runs(limit=limit)]
