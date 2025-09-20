from __future__ import annotations

import asyncio
import os
import pathlib
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from server.api.health import health as _health_handler
from server.api.routers import calibrate as legacy_calibrate, metrics
from server.api.routers.coach import router as coach_router
from server.metrics import MetricsMiddleware, metrics_app
from server.retention.sweeper import sweep_retention_once

from .routes.cv_analyze import router as cv_analyze_router
from .routes.cv_analyze_video import router as cv_analyze_video_router
from .routes.cv_mock import router as cv_mock_router
from .routes.runs import router as runs_router
from .routes.calibrate import router as calibrate_router


def _api_key_dependency():
    async def _dep(request: Request):
        required = os.getenv("API_KEY")
        if not required:
            return
        provided = request.headers.get("x-api-key")
        if provided != required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key"
            )

    return _dep


@asynccontextmanager
async def lifespan(app: FastAPI):
    retention_task: Optional[asyncio.Task] = None

    dirs = [x.strip() for x in os.getenv("RETENTION_DIRS", "").split(",") if x.strip()]
    minutes = int(os.getenv("RETENTION_MINUTES", "15"))

    if dirs:

        async def _loop() -> None:
            while True:
                try:
                    sweep_retention_once(dirs, minutes)
                finally:
                    await asyncio.sleep(300)  # every 5 min

        retention_task = asyncio.create_task(_loop())

    try:
        yield
    finally:
        if retention_task:
            retention_task.cancel()
            try:
                await retention_task
            except asyncio.CancelledError:
                pass


app = FastAPI(lifespan=lifespan)
app.state.STAGING = os.getenv("STAGING") == "1" or os.getenv("APP_ENV") == "staging"

allow = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost,http://127.0.0.1").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allow if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(MetricsMiddleware)

api_dep = _api_key_dependency()

app.include_router(coach_router)
app.include_router(legacy_calibrate.router)
app.include_router(calibrate_router)
app.include_router(metrics.router)
app.add_api_route(
    "/health",
    _health_handler,
    methods=["GET"],
    response_model=None,
    tags=["health"],
)


_metrics_router = APIRouter()


@_metrics_router.get("/metrics", include_in_schema=False)
async def _metrics_endpoint(request: Request):
    return await metrics_app(request)


app.include_router(_metrics_router)

app.include_router(cv_mock_router)
app.include_router(cv_analyze_router)
app.include_router(cv_analyze_video_router)
app.include_router(runs_router)


@app.get("/protected", dependencies=[Depends(api_dep)])
async def protected():
    return {"ok": True}


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}


dist = pathlib.Path(__file__).resolve().parent.parent / "web" / "dist"

if os.getenv("SERVE_WEB", "0") == "1" and dist.exists():
    app.mount("/", StaticFiles(directory=str(dist), html=True), name="web")
