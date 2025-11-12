"""API surface for caddie advice."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from server.caddie.advise import advise
from server.caddie.schemas import AdviseIn, AdviseOut
from server.security import require_api_key

router = APIRouter(dependencies=[Depends(require_api_key)])


@router.post("/api/caddie/advise", response_model=AdviseOut)
def post_advise(body: AdviseIn) -> AdviseOut:
    """Return plays-like distance and club advice."""
    return advise(body)


__all__ = ["router"]
