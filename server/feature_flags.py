from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class EvaluatedFlag:
    enabled: bool
    rollout_pct: int
    source: str


FlagName = str


def _coerce_rollout_pct(env_var: str, default: int = 0) -> int:
    raw = os.getenv(env_var)
    if raw is None:
        return max(0, min(100, default))
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return max(0, min(100, default))
    return max(0, min(100, parsed))


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


def bucket_user(flag_name: str, user_id: str | None) -> int:
    seed = f"{flag_name}:{user_id or ''}".encode("utf-8")
    digest = hashlib.sha256(seed).digest()
    return int.from_bytes(digest[:4], "big") % 100


def evaluate_flag(
    flag_name: str,
    rollout_pct: int,
    user_id: str | None,
    force: Optional[bool] = None,
) -> EvaluatedFlag:
    if force is not None:
        return EvaluatedFlag(enabled=force, rollout_pct=rollout_pct, source="force")
    enabled = bucket_user(flag_name, user_id) < rollout_pct
    return EvaluatedFlag(enabled=enabled, rollout_pct=rollout_pct, source="rollout")


def get_feature_flags(user_id: str | None) -> Dict[FlagName, EvaluatedFlag]:
    practice_rollout = _coerce_rollout_pct("PRACTICE_GROWTH_V1_ROLLOUT_PCT", default=0)
    practice_force = _coerce_force("PRACTICE_GROWTH_V1_FORCE")

    round_flow_rollout = _coerce_rollout_pct("ROUND_FLOW_V2_ROLLOUT_PCT", default=0)
    round_flow_force = _coerce_force("ROUND_FLOW_V2_FORCE")

    return {
        "practiceGrowthV1": evaluate_flag(
            "practiceGrowthV1", practice_rollout, user_id, practice_force
        ),
        "roundFlowV2": evaluate_flag(
            "roundFlowV2", round_flow_rollout, user_id, round_flow_force
        ),
    }


__all__ = [
    "EvaluatedFlag",
    "FlagName",
    "bucket_user",
    "evaluate_flag",
    "get_feature_flags",
]
