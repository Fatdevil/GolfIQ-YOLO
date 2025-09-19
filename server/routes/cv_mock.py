from __future__ import annotations

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from cv_engine.calibration.simple import as_dict, measure_from_tracks
from cv_engine.impact.detector import ImpactDetector
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.metrics.quality import confidence as quality_confidence
from cv_engine.pipeline.analyze import analyze_frames
from server.storage.runs import save_run

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
    mode: str = "tracks"  # "tracks" | "detector"
    persist: bool = False
    run_name: str | None = None


class AnalyzeResponse(BaseModel):
    events: list[int]
    metrics: dict
    run_id: str | None = None


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(req.frames)]

    if req.mode == "detector":
        calib = CalibrationParams.from_reference(req.ref_len_m, req.ref_len_px, req.fps)
        result = analyze_frames(
            frames,
            calib,
            mock=True,
            motion=(req.ball_dx_px, req.ball_dy_px, req.club_dx_px, req.club_dy_px),
        )
        events = result["events"]
        metrics = result["metrics"]
    else:
        events = [e.frame_index for e in ImpactDetector().run(frames)]
        ball = [
            (i * req.ball_dx_px, 100 + i * req.ball_dy_px) for i in range(req.frames)
        ]
        club = [
            (i * req.club_dx_px, 110 + i * req.club_dy_px) for i in range(req.frames)
        ]
        calib = CalibrationParams.from_reference(req.ref_len_m, req.ref_len_px, req.fps)
        m = measure_from_tracks(ball, club, calib)
        metrics = as_dict(m)
        metrics["confidence"] = quality_confidence(ball, club, req.frames)

    rec = None
    if req.persist:
        rec = save_run(
            source="mock",
            mode=getattr(req, "mode", "detector"),
            params=req.model_dump(),
            metrics=dict(metrics),
            events=list(events),
        )
    if "confidence" not in metrics:
        metrics["confidence"] = 0.0
    return AnalyzeResponse(
        events=events, metrics=metrics, run_id=rec.run_id if rec else None
    )
