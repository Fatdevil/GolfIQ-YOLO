from __future__ import annotations

import os

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from cv_engine.calibration.simple import as_dict, measure_from_tracks
from cv_engine.impact.detector import ImpactDetector
from cv_engine.metrics.kinematics import CalibrationParams

router = APIRouter(prefix="/cv/mock", tags=["cv-mock"])


class AnalyzeRequest(BaseModel):
    frames: int = Field(10, ge=2, le=300)
    fps: float = Field(120, gt=0)
    ref_len_m: float = Field(1.0, gt=0)
    ref_len_px: float = Field(100.0, gt=0)
    ball_dx_px: float = 2.0
    ball_dy_px: float = -1.0  # uppåt i bild (y minskar per frame)
    club_dx_px: float = 1.5
    club_dy_px: float = 0.0


class AnalyzeResponse(BaseModel):
    events: list[int]
    metrics: dict


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    # Slå på mock-läge för CV-motorn
    os.environ.setdefault("GOLFIQ_MOCK", "1")

    # 1) Kör ImpactDetector på dummy-frames (snabbt, bara demo)
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(req.frames)]
    events = [e.frame_index for e in ImpactDetector().run(frames)]

    # 2) Syntetiska tracks (px) för mätmotor (deterministiskt)
    #    Notera: y ökar nedåt i bild ⇒ fysikens dy inverteras i kinematik-modulen
    ball = [(i * req.ball_dx_px, 100 + i * req.ball_dy_px) for i in range(req.frames)]
    club = [(i * req.club_dx_px, 110 + i * req.club_dy_px) for i in range(req.frames)]

    calib = CalibrationParams.from_reference(req.ref_len_m, req.ref_len_px, req.fps)
    m = measure_from_tracks(ball, club, calib)

    return AnalyzeResponse(events=events, metrics=as_dict(m))
