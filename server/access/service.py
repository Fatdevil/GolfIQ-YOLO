"""Helpers for deriving access plans."""

from __future__ import annotations

import os

from .models import AccessPlan, PlanName


def _normalize_plan(value: str | None) -> PlanName:
    if value == "pro":
        return "pro"
    return "free"


def _load_config() -> tuple[PlanName, set[str]]:
    default_plan = _normalize_plan(os.getenv("GOLFIQ_DEFAULT_PLAN", "free"))
    pro_keys = {
        key.strip()
        for key in os.getenv("GOLFIQ_PRO_API_KEYS", "").split(",")
        if key.strip()
    }
    return default_plan, pro_keys


_DEFAULT_PLAN, _PRO_KEYS = _load_config()


def reload_config() -> None:
    """Reload cached configuration from environment variables."""

    global _DEFAULT_PLAN, _PRO_KEYS
    _DEFAULT_PLAN, _PRO_KEYS = _load_config()


def determine_plan(api_key: str | None) -> AccessPlan:
    """Return the plan associated with the provided API key."""

    if api_key and api_key in _PRO_KEYS:
        plan: PlanName = "pro"
    else:
        plan = _DEFAULT_PLAN
    return AccessPlan(plan=plan)
