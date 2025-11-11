"""Clip metrics routes."""

from __future__ import annotations

import time
from typing import Iterable, Mapping

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from server.auth import require_admin
from server.security import require_api_key
from server.services import clips_repo, ranking, sg, telemetry as telemetry_service


router = APIRouter(
    prefix="/clips", tags=["clips"], dependencies=[Depends(require_api_key)]
)
events_router = APIRouter(
    prefix="/events", tags=["clips"], dependencies=[Depends(require_api_key)]
)


class ClipMetricsBody(BaseModel):
    start_dist_m: float = Field(..., alias="startDistM", ge=0)
    end_dist_m: float | None = Field(default=None, alias="endDistM", ge=0)
    strokes_used: int = Field(..., alias="strokesUsed", ge=0)
    lie_start: str = Field(default="fairway", alias="lieStart")


class ClipMetricsResponse(BaseModel):
    sg_delta: float = Field(alias="sgDelta")
    anchor_sec: float = Field(alias="anchorSec")


class RankedClipOut(BaseModel):
    id: str
    eventId: str | None = None
    playerName: str | None = None
    createdAt: str | None = None
    videoUrl: str | None = None
    thumbnailUrl: str | None = None
    thumbUrl: str | None = None
    aiTitle: str | None = None
    aiSummary: str | None = None
    aiTtsUrl: str | None = None
    sgDelta: float | None = None
    anchors: list[float] | None = None
    score: float


def _derive_anchor(clip: Mapping[str, object]) -> float:
    anchors = clip.get("anchors") or clip.get("anchorsSec")
    if isinstance(anchors, Iterable) and not isinstance(anchors, (str, bytes)):
        for candidate in anchors:
            try:
                return max(0.0, float(candidate))
            except (TypeError, ValueError):
                continue
    for key in (
        "impact_offset_sec",
        "impactOffsetSec",
        "impact_sec",
        "impactSec",
    ):
        if key in clip:
            try:
                return max(0.0, float(clip[key]))
            except (TypeError, ValueError):
                continue
    duration = (
        clip.get("duration_sec")
        or clip.get("durationSec")
        or clip.get("durationSeconds")
    )
    try:
        if duration is not None:
            value = float(duration)
            if value > 0:
                return max(0.0, min(value, value / 2.0))
    except (TypeError, ValueError):
        pass
    return 0.0


@router.post(
    "/{clip_id}/metrics",
    response_model=ClipMetricsResponse,
    status_code=status.HTTP_200_OK,
)
def record_clip_metrics(
    clip_id: str,
    body: ClipMetricsBody = Body(...),
    member_id: str | None = Depends(require_admin),
) -> ClipMetricsResponse:
    """Calculate strokes-gained for a clip and persist anchors."""

    _ = member_id  # forces admin guard
    try:
        clip = clips_repo.get_clip(clip_id)
    except clips_repo.ClipNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="clip not found"
        ) from exc

    sg_delta_value = sg.sg_delta(
        body.start_dist_m,
        body.end_dist_m,
        body.strokes_used,
        lie_start=body.lie_start,
    )
    anchor_sec = _derive_anchor(clip)
    clips_repo.update_metrics(clip_id, sg_delta=sg_delta_value, anchors=[anchor_sec])
    telemetry_service.emit_clip_sg_recorded(
        clip_id,
        sg_delta=sg_delta_value,
        anchor_sec=anchor_sec,
    )
    return ClipMetricsResponse(sgDelta=sg_delta_value, anchorSec=anchor_sec)


@events_router.get(
    "/{event_id}/top-shots",
    response_model=list[RankedClipOut],
)
def list_top_shots(
    event_id: str,
    member_id: str | None = Depends(require_admin),
    alpha: float | None = Query(default=None),
    beta: float | None = Query(default=None),
    gamma: float | None = Query(default=None),
) -> list[RankedClipOut]:
    _ = member_id
    clips = list(clips_repo.list_for_event(event_id))
    if not clips:
        telemetry_service.emit_clip_rank_evaluated(
            event_id, clip_count=0, top_score=None
        )
        return []
    ranked = ranking.rank_top_shots(
        clips,
        time.time(),
        alpha=alpha if alpha is not None else 0.6,
        beta=beta if beta is not None else 1.0,
        gamma=gamma if gamma is not None else 0.3,
    )
    results: list[RankedClipOut] = []
    for entry in ranked:
        public = clips_repo.to_public(entry)
        public["score"] = entry.get("score", 0.0)
        results.append(RankedClipOut.model_validate(public))
    top_score = ranked[0].get("score") if ranked else None
    telemetry_service.emit_clip_rank_evaluated(
        event_id,
        clip_count=len(ranked),
        top_score=float(top_score) if top_score is not None else None,
    )
    return results


__all__ = ["router", "events_router"]
