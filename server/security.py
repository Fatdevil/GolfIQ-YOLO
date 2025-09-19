"""Shared security helpers for FastAPI apps."""

import os

from fastapi import HTTPException, Request, status


async def require_api_key(request: Request) -> None:
    """Validate that the incoming request provides the configured API key.

    If no ``API_KEY`` environment variable is configured the dependency is a
    no-op, allowing routes to stay open by default. When an API key is set and
    the provided header does not match, a 401 error is raised.
    """

    required = os.getenv("API_KEY")
    if not required:
        return

    provided = request.headers.get("x-api-key")
    if provided != required:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key"
        )
