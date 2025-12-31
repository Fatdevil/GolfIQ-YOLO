from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from server.security import require_api_key
from server.storage.runs import RunSourceType, RunStatus, create_run

router = APIRouter(
    prefix="/api/mobile", tags=["mobile"], dependencies=[Depends(require_api_key)]
)


class MobileRunCreate(BaseModel):
    courseId: str = Field(..., min_length=1)
    courseName: str = Field(..., min_length=1)
    teeId: str | None = None
    teeName: str | None = None
    holes: int = Field(..., gt=0, le=36)
    startedAt: str
    mode: str = Field(..., min_length=1)


class MobileRunResponse(BaseModel):
    runId: str = Field(alias="runId")


@router.post("/runs", response_model=MobileRunResponse)
def create_mobile_run(payload: MobileRunCreate) -> MobileRunResponse:
    try:
        record = create_run(
            source="mobile",
            source_type=RunSourceType.MOBILE.value,
            status=RunStatus.SUCCEEDED,
            mode=payload.mode,
            params={
                "courseId": payload.courseId,
                "courseName": payload.courseName,
                "teeId": payload.teeId,
                "teeName": payload.teeName,
                "holes": payload.holes,
                "startedAt": payload.startedAt,
            },
            metrics={},
            events=[],
        )
    except Exception as exc:  # pragma: no cover - unexpected persistence error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="unable to create run",
        ) from exc

    return MobileRunResponse(runId=record.run_id)


__all__ = ["router"]
