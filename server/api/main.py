import asyncio
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.retention.sweeper import sweep_retention_once

from server.security import require_api_key

from .health import health as _health_handler
from .routers import calibrate, metrics
from .routers.coach import router as coach_router


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

app.include_router(coach_router)
app.include_router(calibrate.router)
app.include_router(metrics.router)
app.add_api_route("/health", _health_handler, methods=["GET"])


@app.get("/protected", dependencies=[Depends(require_api_key)])
async def protected():
    return {"ok": True}


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}
