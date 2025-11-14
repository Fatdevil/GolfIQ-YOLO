"""Access plan API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from server.api.security import require_api_key
from server.access.models import AccessPlan
from server.access.service import determine_plan

router = APIRouter(
    prefix="/api/access",
    tags=["access"],
    dependencies=[Depends(require_api_key)],
)


@router.get("/plan", response_model=AccessPlan)
def get_access_plan(
    x_api_key: str | None = Header(default=None, alias="x-api-key")
) -> AccessPlan:
    """Return the access plan (free/pro) for the caller."""

    return determine_plan(x_api_key)
