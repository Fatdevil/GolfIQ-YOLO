from __future__ import annotations

import os

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from cv_engine.io.videoreader import fps_from_video, frames_from_video
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames

router = APIRouter(prefix="/cv", tags=["cv-video"])


class AnalyzeVideoQuery(BaseModel):
    # Om FPS inte kan läsas ur filen, använd fallback
    fps_fallback: float = Field(120, gt=0)
    ref_len_m: float = Field(1.0, gt=0)
    ref_len_px: float = Field(100.0, gt=0)
    smoothing_window: int = 3


class AnalyzeResponse(BaseModel):
    events: list[int]
    metrics: dict


@router.post("/analyze/video", response_model=AnalyzeResponse)
async def analyze_video(
    query: AnalyzeVideoQuery,
    video: UploadFile = File(..., description="Video (e.g., MP4)"),
):
    # CV i mock-läge (deterministiskt) om inget riktigt weight finns
    os.environ.setdefault("GOLFIQ_MOCK", "1")
    data = await video.read()
    try:
        frames = frames_from_video(data, max_frames=300, stride=1)
    except ImportError:
        raise HTTPException(
            400, "Video extras not installed. Install with: pip install -e '.[video]'"
        )
    if len(frames) < 2:
        raise HTTPException(400, "Could not decode video or not enough frames.")

    fps = fps_from_video(data) or float(query.fps_fallback)
    calib = CalibrationParams.from_reference(query.ref_len_m, query.ref_len_px, fps)
    result = analyze_frames(frames, calib)
    return AnalyzeResponse(**result)
