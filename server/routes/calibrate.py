from math import hypot

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/calibrate", tags=["calibration"])


class MeasureReq(BaseModel):
    p1x: float
    p1y: float
    p2x: float
    p2y: float
    ref_len_m: float = Field(..., gt=0)
    fps: float = Field(..., gt=0)


class MeasureRes(BaseModel):
    meters_per_pixel: float
    fps: float
    quality: str  # "ok" | "low_fps" | "blurry" | "ok_warn"


@router.post("/measure", response_model=MeasureRes)
def measure(req: MeasureReq):
    px_dist = hypot(req.p2x - req.p1x, req.p2y - req.p1y)
    m_per_px = req.ref_len_m / px_dist if px_dist > 0 else 0.0
    # enkel kvalitet: fps & blur-proxy (saknar bild här; bara fps just nu)
    if req.fps < 80:
        q = "low_fps"
    elif req.fps < 120:
        q = "ok_warn"
    else:
        q = "ok"
    return MeasureRes(meters_per_pixel=m_per_px, fps=req.fps, quality=q)
