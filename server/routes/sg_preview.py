"""API endpoints for lightweight SG previews."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from server.security import require_api_key
from server.services.anchors_store import list_run
from server.services.sg_preview import RoundSgPreview, compute_sg_preview_for_run
from server.storage.runs import load_run

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/api/sg/run/{run_id}", response_model=RoundSgPreview)
def get_sg_preview(run_id: str) -> RoundSgPreview:
    run = load_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Unknown run_id")

    anchors = list_run(run_id)
    course_id = None
    if run.params:
        course_id = run.params.get("courseId") or run.params.get("course_id")

    return compute_sg_preview_for_run(run_id, anchors, course_id=course_id)
