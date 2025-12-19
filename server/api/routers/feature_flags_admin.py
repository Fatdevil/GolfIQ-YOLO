from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status

from server.feature_flags_config_store import get_feature_flags_store
from server.security import require_admin_token

router = APIRouter(prefix="/api/admin/feature-flags", tags=["feature-flags-admin"])


def _ensure_payload_dict(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="payload must be a JSON object",
        )
    return payload


def _extract_round_flow_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if "roundFlowV2" in payload:
        if len(payload) != 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="only roundFlowV2 updates are supported",
            )
        payload = payload.get("roundFlowV2")
    payload = _ensure_payload_dict(payload)
    allowed = {"rolloutPercent", "allowlist", "force"}
    updates: dict[str, Any] = {}
    for key, value in payload.items():
        if key not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"unsupported field: {key}",
            )
        updates[key] = value
    return updates


def _validate_round_flow_updates(updates: dict[str, Any]) -> dict[str, Any]:
    validated: dict[str, Any] = {}
    if "rolloutPercent" in updates:
        rollout = updates["rolloutPercent"]
        if not isinstance(rollout, int) or isinstance(rollout, bool):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="rolloutPercent must be an integer",
            )
        if rollout < 0 or rollout > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="rolloutPercent must be between 0 and 100",
            )
        validated["rolloutPercent"] = rollout
    if "allowlist" in updates:
        allowlist = updates["allowlist"]
        if not isinstance(allowlist, list) or not all(
            isinstance(entry, str) for entry in allowlist
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="allowlist must be a list of strings",
            )
        validated["allowlist"] = [entry.strip() for entry in allowlist if entry.strip()]
    if "force" in updates:
        force = updates["force"]
        if force not in {"force_on", "force_off", None}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="force must be one of force_on, force_off, or null",
            )
        validated["force"] = force
    return validated


def _load_config() -> dict[str, Any]:
    return get_feature_flags_store().snapshot().config


@router.get("/config")
async def get_feature_flags_config(request: Request) -> dict[str, Any]:
    require_admin_token(request)
    return _load_config()


@router.put("/config")
async def update_feature_flags_config(request: Request) -> Response:
    updated_by = require_admin_token(request)
    payload = _ensure_payload_dict(await request.json())
    updates = _extract_round_flow_payload(payload)
    validated = _validate_round_flow_updates(updates)
    config = get_feature_flags_store().update(validated, updated_by)
    return Response(content=json.dumps(config), media_type="application/json")


@router.post("/roundFlowV2/allowlist:add")
async def add_round_flow_allowlist_member(request: Request) -> Response:
    updated_by = require_admin_token(request)
    payload = _ensure_payload_dict(await request.json())
    member_id = payload.get("memberId")
    if not isinstance(member_id, str) or not member_id.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="memberId must be a non-empty string",
        )
    snapshot = get_feature_flags_store().snapshot()
    allowlist = list(snapshot.config["roundFlowV2"]["allowlist"])
    member_id = member_id.strip()
    if member_id not in allowlist:
        allowlist.append(member_id)
    config = get_feature_flags_store().update(
        {"allowlist": sorted(allowlist)}, updated_by
    )
    return Response(content=json.dumps(config), media_type="application/json")


@router.post("/roundFlowV2/allowlist:remove")
async def remove_round_flow_allowlist_member(request: Request) -> Response:
    updated_by = require_admin_token(request)
    payload = _ensure_payload_dict(await request.json())
    member_id = payload.get("memberId")
    if not isinstance(member_id, str) or not member_id.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="memberId must be a non-empty string",
        )
    snapshot = get_feature_flags_store().snapshot()
    member_id = member_id.strip()
    allowlist = [
        entry
        for entry in snapshot.config["roundFlowV2"]["allowlist"]
        if entry != member_id
    ]
    config = get_feature_flags_store().update({"allowlist": allowlist}, updated_by)
    return Response(content=json.dumps(config), media_type="application/json")


__all__ = ["router"]
