"""Shared configuration helpers for API access plans and keys."""

from __future__ import annotations

import os
from typing import Set, Tuple

from .models import PlanName


def _normalize_plan(value: str | None) -> PlanName:
    if value == "pro":
        return "pro"
    return "free"


def _parse_keys(raw: str) -> Set[str]:
    return {key.strip() for key in raw.split(",") if key.strip()}


def _load_key_sets() -> tuple[str | None, Set[str], Set[str]]:
    primary = os.getenv("API_KEY")
    pro_keys = _parse_keys(os.getenv("GOLFIQ_PRO_API_KEYS", ""))
    allowed: Set[str] = set(pro_keys)
    if primary:
        allowed.add(primary)
    return primary, allowed, pro_keys


def reload_config() -> None:
    """No-op retained for compatibility; configuration reads from env on demand."""

    return None


def load_api_keys() -> Tuple[str | None, Set[str]]:
    """Return the primary API key and the set of allowed keys."""

    primary, allowed, _ = _load_key_sets()
    return primary, allowed


def lookup_plan_for_key(api_key: str | None) -> PlanName:
    """Return the plan name for the provided API key."""

    _, _, pro_keys = _load_key_sets()
    if api_key and api_key in pro_keys:
        return "pro"
    return _normalize_plan(os.getenv("GOLFIQ_DEFAULT_PLAN", "free"))
