import asyncio
import os
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

from server.metrics.faceon import compute_faceon_metrics
from server.retention.sweeper import sweep_retention_once

from .health import health as _health_handler
from .routers import calibrate
from .routers.coach import router as coach_router

app = FastAPI()
app.include_router(coach_router)
app.include_router(calibrate.router)
app.add_api_route("/health", _health_handler, methods=["GET"])


@app.on_event("startup")
async def _retention_startup():
    # Comma-separated directories to sweep, e.g. 'server/tmp_frames,server/uploads'
    dirs = [x.strip() for x in os.getenv("RETENTION_DIRS", "").split(",") if x.strip()]
    minutes = int(os.getenv("RETENTION_MINUTES", "15"))
    if not dirs:
        return

    async def _loop():
        while True:
            try:
                sweep_retention_once(dirs, minutes)
            finally:
                await asyncio.sleep(300)  # every 5 min

    asyncio.create_task(_loop())


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}


class FaceOnRequest(BaseModel):
    frame_w: int
    frame_h: int
    detections: list
    mm_per_px: Optional[float] = None


@app.post("/metrics/faceon")
def metrics_faceon(req: FaceOnRequest):
    return compute_faceon_metrics(
        detections=req.detections,
        frame_w=req.frame_w,
        frame_h=req.frame_h,
        mm_per_px=req.mm_per_px,
    )
