from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from server.readiness import readiness_checks

router = APIRouter()


@router.get("/ready", tags=["health"])
async def ready() -> JSONResponse:
    """Readiness probe that exercises critical dependencies."""

    result = readiness_checks()
    http_status = (
        status.HTTP_200_OK
        if result.get("status") == "ok"
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )
    return JSONResponse(status_code=http_status, content=result)


__all__ = ["router"]
