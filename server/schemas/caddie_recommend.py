"""FastAPI schemas for the CaddieCore recommendation endpoint."""

from __future__ import annotations

from pydantic import BaseModel

from server.services.caddie_core import models as domain


class RecommendationRequest(domain.RecommendationPayload):
    model_config = {"from_attributes": True}


class RecommendationResponseBody(domain.RecommendationResponse):
    model_config = {"from_attributes": True}


class ErrorEnvelope(BaseModel):
    error_code: str
    message: str
    details: dict | None = None


def to_domain(payload: RecommendationRequest) -> domain.RecommendationPayload:
    return domain.RecommendationPayload.model_validate(payload.model_dump())


def from_domain(response: domain.RecommendationResponse) -> RecommendationResponseBody:
    return RecommendationResponseBody.model_validate(response.model_dump())
