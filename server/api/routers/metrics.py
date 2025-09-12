from typing import Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from server.metrics.faceon import compute_faceon_metrics


class FaceOnMetricsRequest(BaseModel):
    frame_w: int
    frame_h: int
    detections: List[Dict]
    mm_per_px: Optional[float] = None


router = APIRouter()


@router.post("/metrics/faceon")
def metrics_faceon(payload: FaceOnMetricsRequest):
    return compute_faceon_metrics(
        payload.detections,
        frame_w=payload.frame_w,
        frame_h=payload.frame_h,
        mm_per_px=payload.mm_per_px,
    )
