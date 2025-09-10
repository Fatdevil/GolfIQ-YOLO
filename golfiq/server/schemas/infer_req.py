from typing import List, Literal, Optional

from pydantic import BaseModel


class BBox(BaseModel):
    cls: str
    conf: float
    x1: float
    y1: float
    x2: float
    y2: float


class FrameDetections(BaseModel):
    frame_idx: int
    detections: List[BBox]


class InferRequest(BaseModel):
    fps: float
    scale_m_per_px: float
    view: Literal["DTL", "FO"] = "DTL"
    calibrated: bool = False
    # Choose one of the inputs:
    detections: Optional[List[FrameDetections]] = None
    frames_b64: Optional[List[str]] = None  # Optional: data URLs or raw base64 strings
    mode: Optional[Literal["detections", "frames_b64"]] = None
