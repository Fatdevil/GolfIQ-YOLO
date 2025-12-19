from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROUND_FLOW_CONFIG: dict[str, Any] = {
    "rolloutPercent": 0,
    "allowlist": [],
    "force": None,
}

DEFAULT_FEATURE_FLAGS_CONFIG: dict[str, Any] = {
    "roundFlowV2": DEFAULT_ROUND_FLOW_CONFIG,
    "meta": {"updatedAt": None, "updatedBy": None},
}


@dataclass(frozen=True)
class FeatureFlagsConfigSnapshot:
    config: dict[str, Any]
    round_flow_overrides: set[str]
    from_store: bool


def _default_config() -> dict[str, Any]:
    return {
        "roundFlowV2": {
            "rolloutPercent": DEFAULT_ROUND_FLOW_CONFIG["rolloutPercent"],
            "allowlist": list(DEFAULT_ROUND_FLOW_CONFIG["allowlist"]),
            "force": DEFAULT_ROUND_FLOW_CONFIG["force"],
        },
        "meta": {"updatedAt": None, "updatedBy": None},
    }


def _config_path() -> Path:
    configured = os.getenv("FEATURE_FLAGS_CONFIG_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parent / ".data" / "feature_flags_config.json"


def _normalize_round_flow(raw: dict[str, Any] | None) -> dict[str, Any]:
    raw = raw or {}
    rollout = raw.get("rolloutPercent")
    if not isinstance(rollout, int) or isinstance(rollout, bool):
        rollout = DEFAULT_ROUND_FLOW_CONFIG["rolloutPercent"]
    rollout = max(0, min(100, rollout))

    allowlist = raw.get("allowlist")
    if not isinstance(allowlist, list):
        allowlist = list(DEFAULT_ROUND_FLOW_CONFIG["allowlist"])
    else:
        allowlist = [str(entry) for entry in allowlist if str(entry).strip()]

    force = raw.get("force")
    if force not in {"force_on", "force_off", None}:
        force = DEFAULT_ROUND_FLOW_CONFIG["force"]

    return {
        "rolloutPercent": rollout,
        "allowlist": allowlist,
        "force": force,
    }


def _normalize_meta(raw: dict[str, Any] | None) -> dict[str, Any]:
    raw = raw or {}
    updated_at = raw.get("updatedAt")
    updated_by = raw.get("updatedBy")
    return {
        "updatedAt": updated_at if isinstance(updated_at, str) else None,
        "updatedBy": updated_by if isinstance(updated_by, str) else None,
    }


class FeatureFlagsConfigStore:
    def __init__(self, path_provider=_config_path) -> None:
        self._path_provider = path_provider

    @property
    def path(self) -> Path:
        return self._path_provider()

    def snapshot(self) -> FeatureFlagsConfigSnapshot:
        return self._load()

    def update(self, round_flow_updates: dict[str, Any], updated_by: str) -> dict[str, Any]:
        snapshot = self._load()
        config = snapshot.config
        round_flow = config.get("roundFlowV2") or _default_config()["roundFlowV2"]
        round_flow.update(round_flow_updates)
        config["roundFlowV2"] = _normalize_round_flow(round_flow)
        config["meta"] = {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "updatedBy": updated_by,
        }
        self._write(config)
        return config

    def _load(self) -> FeatureFlagsConfigSnapshot:
        path = self.path
        if not path.exists():
            return FeatureFlagsConfigSnapshot(_default_config(), set(), False)
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return FeatureFlagsConfigSnapshot(_default_config(), set(), False)
        if not isinstance(raw, dict):
            return FeatureFlagsConfigSnapshot(_default_config(), set(), False)
        raw_round_flow = raw.get("roundFlowV2")
        overrides: set[str] = set()
        if isinstance(raw_round_flow, dict):
            overrides = set(raw_round_flow.keys())
        config = {
            "roundFlowV2": _normalize_round_flow(
                raw_round_flow if isinstance(raw_round_flow, dict) else None
            ),
            "meta": _normalize_meta(raw.get("meta") if isinstance(raw.get("meta"), dict) else None),
        }
        return FeatureFlagsConfigSnapshot(config, overrides, True)

    def _write(self, config: dict[str, Any]) -> None:
        path = self.path
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        tmp_path.write_text(
            json.dumps(config, indent=2, sort_keys=True), encoding="utf-8"
        )
        os.replace(tmp_path, path)


_store = FeatureFlagsConfigStore()


def get_feature_flags_store() -> FeatureFlagsConfigStore:
    return _store


__all__ = [
    "FeatureFlagsConfigStore",
    "FeatureFlagsConfigSnapshot",
    "DEFAULT_FEATURE_FLAGS_CONFIG",
    "get_feature_flags_store",
]
