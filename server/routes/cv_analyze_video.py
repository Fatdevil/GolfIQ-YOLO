from __future__ import annotations

import os

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from cv_engine.io.videoreader import fps_from_video, frames_from_video
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames
from server.storage.runs import save_run

router = APIRouter(prefix="/cv", tags=["cv-video"])


class AnalyzeVideoQuery(BaseModel):
    # Om FPS inte kan läsas ur filen, använd fallback
    fps_fallback: float = Field(120, gt=0)
    ref_len_m: float = Field(1.0, gt=0)
    ref_len_px: float = Field(100.0, gt=0)
    smoothing_window: int = 3
    persist: bool = False
    run_name: str | None = None


class AnalyzeResponse(BaseModel):
    events: list[int]
    metrics: dict
    run_id: str | None = None


@router.post("/analyze/video", response_model=AnalyzeResponse)
async def analyze_video(
    fps_fallback: float = Form(120, gt=0),
    ref_len_m: float = Form(1.0, gt=0),
    ref_len_px: float = Form(100.0, gt=0),
    smoothing_window: int = Form(3),
    persist: bool = Form(False),
    run_name: str | None = Form(None),
    video: UploadFile = File(..., description="Video (e.g., MP4)"),
):
    query = AnalyzeVideoQuery(
        fps_fallback=fps_fallback,
        ref_len_m=ref_len_m,
        ref_len_px=ref_len_px,
        smoothing_window=smoothing_window,
        persist=persist,
        run_name=run_name,
    )
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
    events = result["events"]
    metrics = result["metrics"]
    if "confidence" not in metrics:
        metrics["confidence"] = 0.0
    rec = None
    if query.persist:
        rec = save_run(
            source="video",
            mode="detector",
            params=query.model_dump(),
            metrics=dict(metrics),
            events=list(events),
        )
    return AnalyzeResponse(
        events=events, metrics=metrics, run_id=rec.run_id if rec else None
    )
