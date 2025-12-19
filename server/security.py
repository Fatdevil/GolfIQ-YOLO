"""Security helpers for API authentication."""

from __future__ import annotations

import os

from fastapi import Header, HTTPException, Query, Request, status

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


def require_admin_token(request: Request) -> str:
    expected = os.getenv("ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin token not configured",
        )
    provided = request.headers.get("x-admin-token")
    if not provided or provided != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid admin token",
        )
    origin = request.headers.get("origin")
    if origin:
        base = f"{request.url.scheme}://{request.url.netloc}"
        if origin.rstrip("/") != base.rstrip("/"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cross-origin POSTs are not permitted",
            )
    hint = provided[-4:] if len(provided) >= 4 else provided
    return f"admin:{hint}"


__all__ = ["require_api_key", "require_admin_token"]
