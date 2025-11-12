"""Upload APIs supporting offline queue idempotency."""

from __future__ import annotations

import hashlib
import time
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from server.security import require_api_key
from server.services.idempotency import key_from_header, recall, remember
from server.storage.s3signer import get_presigned_put


router = APIRouter(
    prefix="/api/uploads",
    tags=["uploads"],
    dependencies=[Depends(require_api_key)],
)


class PresignResponse(BaseModel):
    uploadUrl: str = Field(alias="uploadUrl")
    finalizeUrl: str = Field(alias="finalizeUrl")
    clipMeta: Dict[str, Any] = Field(default_factory=dict, alias="clipMeta")


class FinalizeRequest(BaseModel):
    dedupeKey: str
    clipMeta: Dict[str, Any] = Field(default_factory=dict)


class FinalizeResponse(BaseModel):
    clipId: str = Field(alias="clipId")


_FINALIZED_CLIPS: dict[str, FinalizeResponse] = {}


@router.post("/presign", response_model=PresignResponse)
def presign_upload(request: Request) -> PresignResponse:
    """Return a presigned URL for clip uploads."""

    idem_key = key_from_header(request)
    if idem_key:
        cached = recall(idem_key)
        if cached:
            return PresignResponse.model_validate(cached)

    key = _make_object_key()
    presigned = get_presigned_put(key, ttl_days=1)
    upload_url = presigned["url"]
    finalize_url = "/api/uploads/finalize"
    clip_meta: Dict[str, Any] = {
        "objectKey": key,
        "expiresAt": presigned.get("expiresAt") or int(time.time()) + 86_400,
    }
    response = PresignResponse(
        uploadUrl=upload_url,
        finalizeUrl=finalize_url,
        clipMeta=clip_meta,
    )

    if idem_key:
        remember(idem_key, jsonable_encoder(response))

    return response


@router.post("/finalize", response_model=FinalizeResponse)
def finalize_upload(body: FinalizeRequest) -> FinalizeResponse:
    """Finalize a clip upload in an idempotent manner."""

    dedupe_key = body.dedupeKey.strip()
    if not dedupe_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="dedupeKey required")

    existing = _FINALIZED_CLIPS.get(dedupe_key)
    if existing:
        return existing

    clip_id = _generate_clip_id(body.clipMeta)
    response = FinalizeResponse(clipId=clip_id)
    _FINALIZED_CLIPS[dedupe_key] = response
    return response


def _make_object_key() -> str:
    return f"clips/{uuid.uuid4().hex}/{int(time.time())}"


def _generate_clip_id(meta: Dict[str, Any]) -> str:
    seed = meta.get("objectKey") or uuid.uuid4().hex
    return hashlib.sha1(str(seed).encode("utf-8")).hexdigest()[:16]


def _reset_state() -> None:
    _FINALIZED_CLIPS.clear()


__all__ = ["router", "_FINALIZED_CLIPS", "_reset_state"]
