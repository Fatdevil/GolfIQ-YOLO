from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from cv_engine.io.framesource import frames_from_zip_bytes
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames
from server.storage.runs import save_run

router = APIRouter(prefix="/cv", tags=["cv"])


class AnalyzeQuery(BaseModel):
    fps: float = Field(120, gt=0)
    ref_len_m: float = Field(1.0, gt=0)
    ref_len_px: float = Field(100.0, gt=0)
    mode: str = "detector"  # "detector" | "tracks" ( tracks ej stödd här )
    persist: bool = False
    run_name: str | None = None


class AnalyzeResponse(BaseModel):
    events: list[int]
    metrics: dict
    run_id: str | None = None


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    query: AnalyzeQuery = Depends(),
    frames_zip: UploadFile = File(..., description="ZIP med PNG/JPG eller .npy-filer"),
):
    # CV i mock-läge för determinism
    os.environ.setdefault("GOLFIQ_MOCK", "1")
    buf = await frames_zip.read()
    frames = frames_from_zip_bytes(buf)
    if len(frames) < 2:
        raise HTTPException(
            status_code=400, detail="Need >=2 frames in ZIP (.npy or images)."
        )
    calib = CalibrationParams.from_reference(
        query.ref_len_m, query.ref_len_px, query.fps
    )
    result = analyze_frames(frames, calib)  # använder detektor + vår pipeline
    events = result["events"]
    metrics = result["metrics"]
    if "confidence" not in metrics:
        metrics["confidence"] = 0.0
    rec = None
    if query.persist:
        rec = save_run(
            source="zip",
            mode=getattr(query, "mode", "detector"),
            params=query.model_dump(),
            metrics=dict(metrics),
            events=list(events),
        )
    return AnalyzeResponse(events=events, metrics=metrics, run_id=rec.run_id if rec else None)
