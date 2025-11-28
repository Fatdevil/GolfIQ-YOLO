from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from server.schemas.session_timeline import SessionTimeline
from server.security import require_api_key
from server.services.session_timeline import RunNotFoundError, build_session_timeline

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.get("/api/session/{run_id}/timeline", response_model=SessionTimeline)
def get_session_timeline(run_id: str) -> SessionTimeline:
    try:
        return build_session_timeline(run_id)
    except RunNotFoundError:
        raise HTTPException(status_code=404, detail="Run not found")


__all__ = ["router", "get_session_timeline"]
