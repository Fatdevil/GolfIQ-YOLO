"""Security helpers for API authentication."""

from __future__ import annotations

import os

from fastapi import Header, HTTPException, Query, status

from server.access.config import load_api_keys


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
    api_key_query: str | None = Query(default=None, alias="apiKey"),
) -> str | None:
    """Require a matching API key header when enabled via env.

    Returns the resolved API key (from header or query) so downstream dependencies
    can use the authenticated credential, e.g. for plan lookups.
    """

    candidate = x_api_key or api_key_query

    if os.getenv("REQUIRE_API_KEY", "0") != "1":
        return candidate

    _primary, allowed_keys = load_api_keys()
    if not allowed_keys or candidate not in allowed_keys:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid api key",
        )

    return candidate
