"""API router for run shot time anchors."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from server.schemas.anchors import AnchorIn
from server.security import require_api_key
from server.services.anchors_store import (
    create_or_confirm,
    get_one,
    list_run,
    patch_one,
)

router = APIRouter(
    prefix="/api/runs",
    tags=["anchors"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/{run_id}/anchors", status_code=status.HTTP_200_OK)
def post_run_anchors(run_id: str, body: list[AnchorIn]):
    items = []
    for anchor in body:
        try:
            stored, _created = create_or_confirm(run_id, anchor)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="conflict for existing anchor",
            ) from None
        items.append(stored)
    return items


@router.get("/{run_id}/anchors")
def get_run_anchors(run_id: str):
    return list_run(run_id)


@router.get("/{run_id}/anchors/{hole}/{shot}")
def get_anchor(run_id: str, hole: int, shot: int):
    item = get_one(run_id, hole, shot)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found")
    return item


@router.patch("/{run_id}/anchors/{hole}/{shot}")
def patch_anchor(
    run_id: str,
    hole: int,
    shot: int,
    body: AnchorIn,
    version: int = Query(..., ge=0),
):
    try:
        return patch_one(run_id, hole, shot, body, expected_version=version)
    except ValueError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="version mismatch"
        ) from None
