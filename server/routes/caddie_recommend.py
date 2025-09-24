"""API route for the CaddieCore recommendation endpoint."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from server.schemas import caddie_recommend as schemas
from server.services.caddie_core import service, telemetry

logger = logging.getLogger("caddie_core")

router = APIRouter(prefix="/caddie", tags=["caddie"])


@router.post("/recommend", response_model=schemas.RecommendationResponseBody)
def post_recommend(payload: dict):
    start = time.perf_counter()

    try:
        # Validate incoming payload explicitly to control 422 envelope shape
        domain_payload = schemas.to_domain(
            schemas.RecommendationRequest.model_validate(payload)
        )
        response, log_payload = service.recommend(domain_payload)
    except (ValueError, TypeError) as exc:
        # Return a top-level error envelope (not nested under 'detail')
        return JSONResponse(
            status_code=422,
            content=schemas.ErrorEnvelope(
                error_code="validation_error", message=str(exc), details=None
            ).model_dump(),
        )

    duration_ms = (time.perf_counter() - start) * 1000

    telemetry.record_recommendation_metrics(
        duration_ms=duration_ms,
        scenario=domain_payload.scenario.value,
        confidence=response.recommendation.confidence.value,
        factors_count=len(response.explain_score),
    )

    log_payload["duration_ms"] = duration_ms
    logger.info("caddie_recommend", extra={"caddie_core": log_payload})

    return schemas.from_domain(response)
