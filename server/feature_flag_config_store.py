from __future__ import annotations

import json
import os
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Tuple


DEFAULT_CONFIG: Dict[str, Any] = {
    "roundFlowV2": {
        "rolloutPercent": None,
        "allowlist": None,
        "force": None,
    },
    "meta": {
        "updatedAt": None,
        "updatedBy": None,
    },
}


def _default_config_path() -> Path:
    return Path(__file__).resolve().parent / ".data" / "feature_flags_config.json"


def _normalize_rollout_percent(value: Any) -> int | None:
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if 0 <= parsed <= 100:
        return parsed
    return None


def _normalize_allowlist(value: Any) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        return None
    cleaned = [
        entry.strip() for entry in value if isinstance(entry, str) and entry.strip()
    ]
    return cleaned


def _normalize_force(value: Any) -> str | None:
    if value in {"force_on", "force_off"}:
        return value
    return None


def _normalize_meta(value: Any) -> Dict[str, str | None]:
    if not isinstance(value, dict):
        return {"updatedAt": None, "updatedBy": None}
    updated_at = value.get("updatedAt")
    updated_by = value.get("updatedBy")
    return {
        "updatedAt": updated_at if isinstance(updated_at, str) else None,
        "updatedBy": updated_by if isinstance(updated_by, str) else None,
    }


def _normalize_config(value: Dict[str, Any]) -> Dict[str, Any]:
    round_flow = value.get("roundFlowV2")
    if not isinstance(round_flow, dict):
        round_flow = {}
    meta = _normalize_meta(value.get("meta"))
    return {
        "roundFlowV2": {
            "rolloutPercent": _normalize_rollout_percent(
                round_flow.get("rolloutPercent")
            ),
            "allowlist": _normalize_allowlist(round_flow.get("allowlist")),
            "force": _normalize_force(round_flow.get("force")),
        },
        "meta": meta,
    }


def resolve_config_path() -> Path:
    """Return the resolved feature flag config path.

    Exposed for diagnostics/readiness checks so the config store location can be
    validated without duplicating the resolution rules.
    """

    return Path(os.getenv("FEATURE_FLAGS_CONFIG_PATH", _default_config_path()))


def format_feature_flags_config(config: Dict[str, Any]) -> Dict[str, Any]:
    round_flow = config.get("roundFlowV2") or {}
    meta = config.get("meta") or {}
    rollout_percent = round_flow.get("rolloutPercent")
    allowlist = round_flow.get("allowlist")
    return {
        "roundFlowV2": {
            "rolloutPercent": rollout_percent if rollout_percent is not None else 0,
            "allowlist": allowlist if allowlist is not None else [],
            "force": round_flow.get("force"),
        },
        "meta": {
            "updatedAt": meta.get("updatedAt"),
            "updatedBy": meta.get("updatedBy"),
        },
    }


@dataclass
class FeatureFlagConfigStore:
    def load(self) -> Tuple[Dict[str, Any], bool]:
        path = resolve_config_path()
        if not path.exists():
            return deepcopy(DEFAULT_CONFIG), False
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return deepcopy(DEFAULT_CONFIG), False
        if not isinstance(raw, dict):
            return deepcopy(DEFAULT_CONFIG), False
        return _normalize_config(raw), True

    def save(self, config: Dict[str, Any]) -> None:
        path = resolve_config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(".tmp")
        with temp_path.open("w", encoding="utf-8") as handle:
            json.dump(config, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(temp_path, path)

    def update(self, updates: Dict[str, Any], updated_by: str) -> Dict[str, Any]:
        current, _ = self.load()
        merged = deepcopy(current)
        round_flow_updates = updates.get("roundFlowV2")
        if isinstance(round_flow_updates, dict):
            merged_round_flow = merged.setdefault("roundFlowV2", {})
            for key in ("rolloutPercent", "allowlist", "force"):
                if key in round_flow_updates:
                    merged_round_flow[key] = round_flow_updates[key]
        merged_meta = merged.setdefault("meta", {})
        merged_meta["updatedAt"] = datetime.now(timezone.utc).isoformat()
        merged_meta["updatedBy"] = updated_by
        self.save(merged)
        return merged


store = FeatureFlagConfigStore()


__all__ = [
    "DEFAULT_CONFIG",
    "FeatureFlagConfigStore",
    "resolve_config_path",
    "format_feature_flags_config",
    "store",
]
