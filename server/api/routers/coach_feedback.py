from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Any, Deque, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import AliasChoices, BaseModel, Field, model_validator

from server.services.coach import generate_feedback
from server.storage.runs import load_run

router = APIRouter(tags=["coach"])

_RATE_LIMIT_WINDOW_SEC = 60.0
_RATE_LIMIT_MAX_REQUESTS = 5
_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)
_rate_lock = Lock()


class CoachFeedbackRequest(BaseModel):
    run_id: Optional[str] = Field(
        default=None,
        alias="run_id",
        validation_alias=AliasChoices("run_id", "runId"),
    )
    metrics: Optional[Dict[str, Any]] = None

    model_config = {
        "populate_by_name": True,
    }

    @model_validator(mode="after")
    def validate_payload(self) -> "CoachFeedbackRequest":
        if not self.run_id and not self.metrics:
            raise ValueError("Provide either run_id or metrics")
        return self


class CoachFeedbackResponse(BaseModel):
    text: str
    provider: str
    latency_ms: int


def _rate_limit(ip: str) -> None:
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets[ip]
        while bucket and now - bucket[0] > _RATE_LIMIT_WINDOW_SEC:
            bucket.popleft()
        if len(bucket) >= _RATE_LIMIT_MAX_REQUESTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many coach feedback requests",
            )
        bucket.append(now)


@router.post("/coach/feedback", response_model=CoachFeedbackResponse)
async def coach_feedback(
    request: Request, body: CoachFeedbackRequest
) -> CoachFeedbackResponse:
    client = request.client.host if request.client else "unknown"
    _rate_limit(client)

    metrics: Dict[str, Any] = {}
    if body.run_id:
        record = load_run(body.run_id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Run not found"
            )
        if isinstance(record.metrics, dict):
            metrics = dict(record.metrics)
    if body.metrics:
        if not isinstance(body.metrics, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="metrics must be an object",
            )
        metrics.update(body.metrics)

    result = generate_feedback(metrics)
    return CoachFeedbackResponse(**result)
