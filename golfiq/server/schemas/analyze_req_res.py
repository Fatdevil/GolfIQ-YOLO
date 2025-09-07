from pydantic import BaseModel
from typing import Optional

class AnalyzeMeta(BaseModel):
    fps: float
    scale_m_per_px: float
    calibrated: bool
    view: Optional[str] = None

class Metrics(BaseModel):
    club_speed_mps: float
    ball_speed_mps: float
    launch_deg: float
    carry_m: float

class AnalyzeResponse(BaseModel):
    shot_id: str
    metrics: Metrics
    quality: str
    meta: AnalyzeMeta
