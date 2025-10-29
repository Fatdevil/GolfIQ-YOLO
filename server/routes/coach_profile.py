from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/coach/profile", tags=["coach"])

_STORE: Dict[str, Dict[str, Any]] = {}


def _sync_enabled() -> bool:
    value = os.getenv("COACH_SYNC_ENABLED", "0")
    if value is None:
        return False
    normalized = str(value).strip().lower()
    return normalized in {"1", "true", "yes", "on"}


def _normalize_device_id(device_id: str) -> str:
    normalized = device_id.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="deviceId required"
        )
    return normalized


class CoachProfileEnvelope(BaseModel):
    deviceId: str = Field(..., min_length=1)
    profile: Dict[str, Any]


@router.get("", response_model=Dict[str, Any])
async def get_coach_profile(deviceId: str) -> Dict[str, Any]:
    if not _sync_enabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="sync disabled"
        )
    key = _normalize_device_id(deviceId)
    profile = _STORE.get(key)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="profile not found"
        )
    return profile


@router.post("", status_code=status.HTTP_200_OK)
async def post_coach_profile(payload: CoachProfileEnvelope) -> Dict[str, bool]:
    if not _sync_enabled():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="sync disabled"
        )
    key = _normalize_device_id(payload.deviceId)
    _STORE[key] = payload.profile
    return {"ok": True}


def reset_store() -> None:
    _STORE.clear()
