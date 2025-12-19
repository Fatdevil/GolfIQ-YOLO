from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Dict, Optional

from server.feature_flag_config_store import store


@dataclass
class EvaluatedFlag:
    enabled: bool
    rollout_pct: int
    source: str
    reason: str


FlagName = str


def _coerce_rollout_pct_value(raw: str | None, default: int = 0) -> int:
    if raw is None:
        return max(0, min(100, default))
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return max(0, min(100, default))
    return max(0, min(100, parsed))


def _coerce_rollout_pct(env_vars: tuple[str, ...], default: int = 0) -> int:
    for env_var in env_vars:
        if env_var in os.environ:
            return _coerce_rollout_pct_value(os.getenv(env_var), default=default)
    return max(0, min(100, default))


def _coerce_force(env_var: str) -> Optional[bool]:
    raw = os.getenv(env_var)
    if raw is None:
        return None
    token = raw.strip().lower()
    if token in {"1", "true", "on", "yes", "enable", "enabled"}:
        return True
    if token in {"0", "false", "off", "no", "disable", "disabled"}:
        return False
    return None


def _parse_allowlist(env_var: str) -> set[str]:
    raw = os.getenv(env_var, "")
    if not raw:
        return set()
    return {entry.strip() for entry in raw.split(",") if entry.strip()}


def _resolve_round_flow_config() -> tuple[int, Optional[bool], set[str]]:
    config, has_config = store.load()
    round_flow = config.get("roundFlowV2") if has_config else {}
    rollout_raw = round_flow.get("rolloutPercent") if isinstance(round_flow, dict) else None
    force_raw = round_flow.get("force") if isinstance(round_flow, dict) else None
    allowlist_raw = round_flow.get("allowlist") if isinstance(round_flow, dict) else None

    rollout_pct = None
    if rollout_raw is not None:
        rollout_pct = _coerce_rollout_pct_value(str(rollout_raw), default=0)
    if rollout_pct is None:
        rollout_pct = _coerce_rollout_pct(
            ("ROUND_FLOW_V2_ROLLOUT_PERCENT", "ROUND_FLOW_V2_ROLLOUT_PCT"),
            default=0,
        )

    force_value: Optional[bool] = None
    if force_raw in {"force_on", "force_off"}:
        force_value = force_raw == "force_on"
    if force_value is None:
        force_value = _coerce_force("ROUND_FLOW_V2_FORCE")

    allowlist: set[str] = set()
    allowlist_defined = False
    if isinstance(allowlist_raw, list):
        allowlist_defined = True
        allowlist = {entry.strip() for entry in allowlist_raw if isinstance(entry, str)}
        allowlist = {entry for entry in allowlist if entry}
    if not allowlist_defined:
        allowlist = _parse_allowlist("ROUND_FLOW_V2_ALLOWLIST")

    return rollout_pct, force_value, allowlist


def bucket_user(flag_name: str, user_id: str | None) -> int:
    seed = f"{flag_name}:{user_id or ''}".encode("utf-8")
    digest = hashlib.sha256(seed).digest()
    return int.from_bytes(digest[:4], "big") % 100


def evaluate_flag(
    flag_name: str,
    rollout_pct: int,
    user_id: str | None,
    force: Optional[bool] = None,
    allowlist: set[str] | None = None,
) -> EvaluatedFlag:
    if force is not None:
        reason = "force_on" if force else "force_off"
        return EvaluatedFlag(
            enabled=force,
            rollout_pct=rollout_pct,
            source="force",
            reason=reason,
        )
    if allowlist and user_id and user_id in allowlist:
        return EvaluatedFlag(
            enabled=True,
            rollout_pct=rollout_pct,
            source="allowlist",
            reason="allowlist",
        )
    enabled = bucket_user(flag_name, user_id) < rollout_pct
    reason = "percent" if enabled else "default_off"
    return EvaluatedFlag(
        enabled=enabled,
        rollout_pct=rollout_pct,
        source="rollout",
        reason=reason,
    )


def get_feature_flags(user_id: str | None) -> Dict[FlagName, EvaluatedFlag]:
    practice_rollout = _coerce_rollout_pct(
        ("PRACTICE_GROWTH_V1_ROLLOUT_PERCENT", "PRACTICE_GROWTH_V1_ROLLOUT_PCT"),
        default=0,
    )
    practice_force = _coerce_force("PRACTICE_GROWTH_V1_FORCE")

    round_flow_rollout, round_flow_force, round_flow_allowlist = _resolve_round_flow_config()

    return {
        "practiceGrowthV1": evaluate_flag(
            "practiceGrowthV1", practice_rollout, user_id, practice_force
        ),
        "roundFlowV2": evaluate_flag(
            "roundFlowV2",
            round_flow_rollout,
            user_id,
            round_flow_force,
            allowlist=round_flow_allowlist,
        ),
    }


__all__ = [
    "EvaluatedFlag",
    "FlagName",
    "bucket_user",
    "evaluate_flag",
    "get_feature_flags",
]
