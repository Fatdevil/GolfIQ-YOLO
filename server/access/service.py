"""Helpers for deriving access plans."""

from __future__ import annotations

from .config import lookup_plan_for_key, reload_config as _reload_config
from .models import AccessPlan, PlanName


def reload_config() -> None:
    """Reload cached configuration from environment variables."""

    _reload_config()


def determine_plan(api_key: str | None) -> AccessPlan:
    """Return the plan associated with the provided API key."""

    plan: PlanName = lookup_plan_for_key(api_key)
    return AccessPlan(plan=plan)
