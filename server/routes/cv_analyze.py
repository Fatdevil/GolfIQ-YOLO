from __future__ import annotations

import io
import os
import zipfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from cv_engine.io.framesource import frames_from_zip_bytes
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames
from server.config import (
    CAPTURE_IMPACT_FRAMES,
    IMPACT_CAPTURE_AFTER,
    IMPACT_CAPTURE_BEFORE,
    MAX_ZIP_FILES,
    MAX_ZIP_RATIO,
    MAX_ZIP_SIZE_BYTES,
)
from server.security import require_api_key
from server.storage.runs import save_impact_frames, save_run

router = APIRouter(prefix="/cv", tags=["cv"], dependencies=[Depends(require_api_key)])


class AnalyzeQuery(BaseModel):
    fps: float = Field(120, gt=0)
    ref_len_m: float = Field(1.0, gt=0)
    ref_len_px: float = Field(100.0, gt=0)
    mode: str = "detector"  # "detector" | "tracks" ( tracks ej stödd här )
    smoothing_window: int = 3
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
    data = await frames_zip.read(MAX_ZIP_SIZE_BYTES + 1)
    if len(data) > MAX_ZIP_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="ZIP too large",
        )
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            members = [m for m in zf.infolist() if not m.is_dir()]
            if len(members) > MAX_ZIP_FILES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Too many files in ZIP",
                )
            uncompressed_sum = sum(m.file_size for m in members)
            compressed_sum = sum(m.compress_size for m in members)
            if any(m.file_size > MAX_ZIP_SIZE_BYTES for m in members):
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File too large in ZIP",
                )
            if compressed_sum == 0 and uncompressed_sum > 0:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="ZIP compression ratio too high",
                )
            if compressed_sum > 0:
                ratio = uncompressed_sum / compressed_sum
                if ratio > MAX_ZIP_RATIO:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="ZIP compression ratio too high",
                    )
            allowed_ext = {".npy", ".png", ".jpg", ".jpeg"}
            for member in members:
                ext = os.path.splitext(member.filename)[1].lower()
                if ext not in allowed_ext:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid file type in ZIP",
                    )
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid ZIP file") from exc

    frames = frames_from_zip_bytes(data)
    if len(frames) < 2:
        raise HTTPException(
            status_code=400, detail="Need >=2 frames in ZIP (.npy or images)."
        )
    calib = CalibrationParams.from_reference(
        query.ref_len_m, query.ref_len_px, query.fps
    )
    result = analyze_frames(
        frames,
        calib,
        mock=True,
        smoothing_window=query.smoothing_window,
    )  # använder detektor + vår pipeline
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
        impact_idx = events[0] if events else None
        if rec and CAPTURE_IMPACT_FRAMES and impact_idx is not None:
            start = max(0, impact_idx - IMPACT_CAPTURE_BEFORE)
            stop = min(len(frames), impact_idx + IMPACT_CAPTURE_AFTER)
            if stop > start:
                preview = save_impact_frames(rec.run_id, frames[start:stop])
                import json
                from pathlib import Path

                run_json_path = Path(preview).parent / "run.json"
                try:
                    data = json.loads(run_json_path.read_text())
                    data["impact_preview"] = preview
                    run_json_path.write_text(json.dumps(data, indent=2))
                except Exception:
                    pass
    return AnalyzeResponse(
        events=events, metrics=metrics, run_id=rec.run_id if rec else None
    )
