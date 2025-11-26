from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from server.security import require_api_key
from server.services.sg_summary import (
    MemberSgSummary,
    aggregate_sg_previews,
    list_member_runs,
    load_member_sg_previews_for_runs,
)

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/api/sg/member/{member_id}", response_model=MemberSgSummary)
async def get_member_sg_summary(
    member_id: str,
    limit: int = 5,
    runIds: Optional[List[str]] = Query(default=None, alias="runIds"),
) -> MemberSgSummary:
    run_ids = runIds or await list_member_runs(member_id, limit=limit)

    if not run_ids:
        return MemberSgSummary(
            memberId=member_id,
            runIds=[],
            total_sg=0.0,
            avg_sg_per_round=0.0,
            per_category={},
        )

    previews = await load_member_sg_previews_for_runs(member_id, run_ids)
    return aggregate_sg_previews(member_id, previews)
