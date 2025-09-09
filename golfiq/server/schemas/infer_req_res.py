from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any

class Box(BaseModel):
    cls: str
    conf: float
    x1: float
    y1: float
    x2: float
    y2: float

class DetFrame(BaseModel):
    t: Optional[float] = None
    dets: List[Box]

class ImgFrame(BaseModel):
    t: Optional[float] = None
    image_b64: str

class Meta(BaseModel):
    fps: float = 120.0
    scale_m_per_px: float = 0.002
    calibrated: bool = False
    view: Literal["DTL","FO"] = "DTL"

class YoloConfig(BaseModel):
    model_path: str
    class_map: Optional[Dict[int,str]] = None
    conf: float = 0.25

class TrackingConfig(BaseModel):
    mode: Literal["nn","sortlite"] = "nn"
    iou_thr: float = 0.2
    max_jump_px: float = 100.0

class InferRequest(BaseModel):
    mode: Literal["detections","frames_b64"]
    detections: Optional[List[DetFrame]] = None
    frames: Optional[List[ImgFrame]] = None
    meta: Meta
    yolo: Optional[YoloConfig] = None
    tracking: Optional[TrackingConfig] = None

class Metrics(BaseModel):
    club_speed_mps: float
    ball_speed_mps: float
    launch_deg: float
    carry_m: float

class InferResponse(BaseModel):
    shot_id: str
    metrics: Metrics
    quality: Literal["green","yellow","red"]
    meta: Meta
