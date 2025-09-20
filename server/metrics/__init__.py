from __future__ import annotations

import os
import time
from typing import Any, Awaitable, Callable

from fastapi import Request, Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)

REGISTRY = CollectorRegistry()
REQUESTS = Counter(
    "requests_total", "HTTP requests", ["path", "method", "status"], registry=REGISTRY
)
LATENCY = Histogram(
    "request_latency_seconds",
    "Request latency (seconds)",
    ["path", "method"],
    registry=REGISTRY,
)

BUILD_VERSION = os.getenv("BUILD_VERSION", "dev")
GIT_SHA = os.getenv("GIT_SHA", "unknown")


async def metrics_app(_req: Request | None = None) -> Response:
    data = generate_latest(REGISTRY)
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


class MetricsMiddleware:
    def __init__(self, app: Callable[..., Awaitable[Any]]):
        self.app = app

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[..., Awaitable[Any]],
        send: Callable[..., Awaitable[Any]],
    ) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        path = scope.get("path", "")
        start = time.perf_counter()
        status_code = 500

        async def _send(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message.get("type") == "http.response.start":
                status_code = message.get("status", 200)
            await send(message)

        try:
            await self.app(scope, receive, _send)
        finally:
            duration = time.perf_counter() - start
            LATENCY.labels(path=path, method=method).observe(duration)
            REQUESTS.labels(path=path, method=method, status=str(status_code)).inc()


__all__ = [
    "REGISTRY",
    "REQUESTS",
    "LATENCY",
    "BUILD_VERSION",
    "GIT_SHA",
    "metrics_app",
    "MetricsMiddleware",
]
