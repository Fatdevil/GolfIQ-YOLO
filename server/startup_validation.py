from __future__ import annotations

import os
from typing import List


def _is_strict_env() -> bool:
    env = os.getenv("APP_ENV", "").strip().lower()
    return os.getenv("STAGING") == "1" or env in {"staging", "production", "prod"}


def validate_startup() -> None:
    """Fail fast on missing critical configuration."""

    errors: List[str] = []

    if os.getenv("REQUIRE_API_KEY", "0") == "1" and not os.getenv("API_KEY"):
        errors.append("API_KEY must be set when REQUIRE_API_KEY=1")

    strict_env = _is_strict_env()
    if strict_env and not os.getenv("ADMIN_TOKEN"):
        errors.append("ADMIN_TOKEN must be set when feature flag admin routes are enabled")

    if strict_env and not os.getenv("LIVE_SIGN_SECRET"):
        errors.append("LIVE_SIGN_SECRET must be set when live signing routes are enabled")
    if strict_env and not os.getenv("LIVE_VIEWER_SIGN_KEY"):
        errors.append("LIVE_VIEWER_SIGN_KEY must be set when live viewer tokens are enabled")

    if errors:
        joined = "; ".join(errors)
        raise RuntimeError(f"Startup validation failed: {joined}")


__all__ = ["validate_startup"]
