from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from server.metrics.faceon import compute_faceon_metrics
from fastapi import FastAPI

from .health import health as _health_handler
from .routers import calibrate
from .routers.coach import router as coach_router

app = FastAPI()
app.include_router(coach_router)
app.include_router(calibrate.router)
app.add_api_route("/health", _health_handler, methods=["GET"])


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}


class FaceOnRequest(BaseModel):
    frame_w: int
    frame_h: int
    detections: list
    mm_per_px: float | None = None


@app.post("/metrics/faceon")
def metrics_faceon(req: FaceOnRequest):
    return compute_faceon_metrics(
        detections=req.detections,
        frame_w=req.frame_w,
        frame_h=req.frame_h,
        mm_per_px=req.mm_per_px,
    )
