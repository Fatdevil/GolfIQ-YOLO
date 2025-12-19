from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status

from server.feature_flag_config_store import format_feature_flags_config, store

router = APIRouter()


def _require_admin_token(
    x_admin_token: str | None = Header(default=None, alias="x-admin-token"),
) -> str:
    expected = os.getenv("ADMIN_TOKEN")
    if not expected or not x_admin_token or x_admin_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid admin token",
        )
    return x_admin_token


def _validate_rollout_percent(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rolloutPercent must be an integer between 0 and 100",
        )
    if 0 <= value <= 100:
        return value
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="rolloutPercent must be an integer between 0 and 100",
    )


def _validate_allowlist(value: Any) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list) or any(not isinstance(entry, str) for entry in value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="allowlist must be a list of strings",
        )
    return [entry for entry in (item.strip() for item in value) if entry]


def _validate_force(value: Any) -> str | None:
    if value in (None, "force_on", "force_off"):
        return value
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="force must be force_on, force_off, or null",
    )


def _validate_update_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="payload must be a JSON object",
        )
    updates: Dict[str, Any] = {}
    round_flow = payload.get("roundFlowV2")
    if round_flow is None:
        return updates
    if not isinstance(round_flow, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="roundFlowV2 must be a JSON object",
        )
    round_flow_updates: Dict[str, Any] = {}
    if "rolloutPercent" in round_flow:
        round_flow_updates["rolloutPercent"] = _validate_rollout_percent(
            round_flow.get("rolloutPercent")
        )
    if "allowlist" in round_flow:
        round_flow_updates["allowlist"] = _validate_allowlist(round_flow.get("allowlist"))
    if "force" in round_flow:
        round_flow_updates["force"] = _validate_force(round_flow.get("force"))
    if round_flow_updates:
        updates["roundFlowV2"] = round_flow_updates
    return updates


def _admin_identity(token: str) -> str:
    return f"admin:{token}"


@router.get("/api/admin/feature-flags/config")
def get_feature_flags_config(
    token: str = Depends(_require_admin_token),
):
    _ = token
    config, _ = store.load()
    return format_feature_flags_config(config)


@router.put("/api/admin/feature-flags/config")
def update_feature_flags_config(
    payload: Dict[str, Any] = Body(default_factory=dict),
    token: str = Depends(_require_admin_token),
):
    updates = _validate_update_payload(payload)
    if not updates:
        config, _ = store.load()
        return format_feature_flags_config(config)
    config = store.update(updates, updated_by=_admin_identity(token))
    return format_feature_flags_config(config)


@router.post("/api/admin/feature-flags/roundFlowV2/allowlist:add")
def add_round_flow_allowlist_member(
    payload: Dict[str, Any] = Body(...),
    token: str = Depends(_require_admin_token),
):
    member_id = payload.get("memberId")
    if not isinstance(member_id, str) or not member_id.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="memberId must be a non-empty string",
        )
    config, _ = store.load()
    round_flow = config.get("roundFlowV2") or {}
    allowlist = round_flow.get("allowlist") or []
    updated_allowlist = sorted({*allowlist, member_id.strip()})
    updated = store.update(
        {"roundFlowV2": {"allowlist": updated_allowlist}},
        updated_by=_admin_identity(token),
    )
    return format_feature_flags_config(updated)


@router.post("/api/admin/feature-flags/roundFlowV2/allowlist:remove")
def remove_round_flow_allowlist_member(
    payload: Dict[str, Any] = Body(...),
    token: str = Depends(_require_admin_token),
):
    member_id = payload.get("memberId")
    if not isinstance(member_id, str) or not member_id.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="memberId must be a non-empty string",
        )
    config, _ = store.load()
    round_flow = config.get("roundFlowV2") or {}
    allowlist = round_flow.get("allowlist") or []
    updated_allowlist = sorted(
        entry for entry in allowlist if entry.strip() and entry.strip() != member_id.strip()
    )
    updated = store.update(
        {"roundFlowV2": {"allowlist": updated_allowlist}},
        updated_by=_admin_identity(token),
    )
    return format_feature_flags_config(updated)


__all__ = ["router"]
