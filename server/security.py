"""Security helpers for API authentication."""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, status


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Require a matching API key header when enabled via env."""
    if os.getenv("REQUIRE_API_KEY", "0") != "1":
        return
    expected = os.getenv("API_KEY")
    if not expected or x_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid api key",
        )
