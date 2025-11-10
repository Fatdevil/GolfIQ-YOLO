"""Admin routes exposing clip commentary queue state."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from server.auth import require_admin
from server.schemas.commentary import ClipCommentaryOut, CommentaryStatus
from server.security import require_api_key
from server.services import commentary_queue, telemetry as telemetry_service

router = APIRouter(tags=["commentary"], dependencies=[Depends(require_api_key)])


@router.get(
    "/events/{event_id}/clips",
    response_model=list[ClipCommentaryOut],
)
def list_event_clip_commentary(
    event_id: str,
    status_filter: CommentaryStatus | None = Query(default=None, alias="status"),
    member_id: str | None = Depends(require_admin),
) -> list[ClipCommentaryOut]:
    """Return commentary records for an event."""

    _ = member_id  # unused but forces admin guard
    return commentary_queue.list_for_event(event_id, status=status_filter)


@router.get(
    "/clips/{clip_id}/commentary",
    response_model=ClipCommentaryOut,
)
def get_clip_commentary(
    clip_id: str, member_id: str | None = Depends(require_admin)
) -> ClipCommentaryOut:
    """Return commentary metadata for a clip."""

    _ = member_id
    try:
        return commentary_queue.get(clip_id)
    except KeyError as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="clip commentary not found",
        ) from exc


@router.post(
    "/clips/{clip_id}/commentary/play",
    status_code=status.HTTP_202_ACCEPTED,
)
def record_clip_commentary_play(
    clip_id: str, member_id: str | None = Depends(require_admin)
) -> dict[str, str]:
    """Record playback telemetry for a commentary clip."""

    _ = member_id
    event_id = commentary_queue.resolve_event_id(clip_id)
    if event_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="clip commentary not found",
        )
    telemetry_service.emit_commentary_play_tts(event_id, clip_id)
    return {"status": "ok"}
