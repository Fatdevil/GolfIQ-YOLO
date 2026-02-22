from __future__ import annotations

"""Shot session endpoints for the coach dashboard."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from server.security import require_api_key
from server.services.session_service import (
    get_session_summary,
    list_sessions,
    record_hit,
    start_session,
)

router = APIRouter(
    prefix="/session", tags=["session"], dependencies=[Depends(require_api_key)]
)


class SessionSummary(BaseModel):
    session_id: str = Field(..., alias="session_id")
    user_id: str
    started_at: str | None = None
    ended_at: Optional[str] = None
    total_shots: int
    on_target_shots: int
    on_target_percent: float


class SessionStartRequest(BaseModel):
    user_id: str


class SessionStartResponse(BaseModel):
    session_id: str
    user_id: str
    started_at: str


class ScoreHitRequest(BaseModel):
    session_id: str
    on_target: bool = False


@router.post("/start", response_model=SessionStartResponse)
def start_new_session(payload: SessionStartRequest) -> SessionStartResponse:
    session = start_session(payload.user_id)
    return SessionStartResponse(
        session_id=session.session_id,
        user_id=session.user_id,
        started_at=session.started_at.isoformat(),
    )


@router.post("/score/hit", response_model=SessionSummary)
def record_hit_for_session(body: ScoreHitRequest) -> SessionSummary:
    try:
        record_hit(body.session_id, on_target=body.on_target)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found"
        )

    summary = get_session_summary(body.session_id)
    assert summary is not None
    return SessionSummary(**_serialize_summary(summary))


@router.get("/list", response_model=List[SessionSummary])
def list_sessions_for_user(user_id: Optional[str] = Query(default=None)) -> List[SessionSummary]:
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id_required")

    summaries = list_sessions(user_id)
    return [SessionSummary(**_serialize_summary(summary)) for summary in summaries]


@router.get("/{session_id}/summary", response_model=SessionSummary)
def get_session_details(session_id: str) -> SessionSummary:
    summary = get_session_summary(session_id)
    if not summary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    return SessionSummary(**_serialize_summary(summary))


def _serialize_summary(summary: dict) -> dict:
    return {
        **summary,
        "started_at": summary.get("started_at").isoformat()
        if summary.get("started_at")
        else None,
        "ended_at": summary.get("ended_at").isoformat()
        if summary.get("ended_at")
        else None,
    }


__all__ = ["router"]
