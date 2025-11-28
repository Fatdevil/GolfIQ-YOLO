"""Endpoints to sync Quick Round progress to paired watches."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from server.api.security import require_api_key
from server.courses.store import get_course_bundle
from server.services.watch_bridge import send_hud_to_device
from server.services.watch_devices import get_primary_device_for_member
from server.watch.hud_service import build_hole_hud

router = APIRouter(
    prefix="/api/watch/quickround",
    tags=["watch-quickround"],
    dependencies=[Depends(require_api_key)],
)


class QuickRoundSyncIn(BaseModel):
    memberId: str
    runId: str
    courseId: str | None = None
    hole: int


class QuickRoundSyncOut(BaseModel):
    deviceId: str | None
    synced: bool


@router.post("/sync", response_model=QuickRoundSyncOut)
def sync_quickround_to_watch(
    payload: QuickRoundSyncIn,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
) -> QuickRoundSyncOut:
    if payload.hole < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="hole must be positive"
        )

    device = get_primary_device_for_member(payload.memberId)
    if not device:
        return QuickRoundSyncOut(deviceId=None, synced=False)

    # Optional: validate the provided course bundle when present to surface errors early
    if payload.courseId:
        bundle = get_course_bundle(payload.courseId)
        if bundle is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="course not found"
            )

    hud = build_hole_hud(
        member_id=payload.memberId,
        run_id=payload.runId,
        hole=payload.hole,
        course_id=payload.courseId,
        gnss=None,
        api_key=x_api_key,
    )

    sent = send_hud_to_device(device.device_id, hud)

    return QuickRoundSyncOut(deviceId=device.device_id, synced=bool(sent))
