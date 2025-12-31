from __future__ import annotations

from tempfile import SpooledTemporaryFile

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from pydantic import BaseModel, Field
from starlette.status import (
    HTTP_413_CONTENT_TOO_LARGE as HTTP_413_REQUEST_ENTITY_TOO_LARGE,
)

from cv_engine.io.videoreader import fps_from_video, frames_from_video
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames
from .cv_analyze import AnalyzeMetrics
from server.config import (
    CAPTURE_IMPACT_FRAMES,
    IMPACT_CAPTURE_AFTER,
    IMPACT_CAPTURE_BEFORE,
    MAX_VIDEO_BYTES,
)
from server.security import require_api_key
from server.services.cv_mock import effective_mock
from server.storage.runs import save_impact_frames, save_run

router = APIRouter(
    prefix="/cv", tags=["cv-video"], dependencies=[Depends(require_api_key)]
)


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
    metrics: AnalyzeMetrics
    run_id: str | None = None


@router.post("/analyze/video", response_model=AnalyzeResponse)
async def analyze_video(
    response: Response,
    mock: bool | None = Query(
        None, description="Optional override for CV mock backend"
    ),
    mock_header: str | None = Header(default=None, alias="x-cv-mock"),
    model_variant_header: str | None = Header(default=None, alias="x-model-variant"),
    mock_form: bool | None = Form(
        default=None,
        alias="mock",
        description="Optional override for CV mock backend",
    ),
    model_variant_form: str | None = Form(
        default=None,
        alias="model_variant",
        description="Optional override for YOLO model variant",
    ),
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
    header_len = video.headers.get("content-length")
    if header_len:
        try:
            if int(header_len) > MAX_VIDEO_BYTES:
                raise HTTPException(
                    status_code=HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Video too large",
                )
        except ValueError:
            pass

    with SpooledTemporaryFile(max_size=MAX_VIDEO_BYTES) as tmp:
        total = 0
        chunk_size = 1024 * 1024
        while True:
            chunk = await video.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_VIDEO_BYTES:
                raise HTTPException(
                    status_code=HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Video too large",
                )
            tmp.write(chunk)
        tmp.seek(0)
        data = tmp.read()
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
    use_mock = effective_mock(mock, mock_header, mock_form)
    response.headers["x-cv-source"] = "mock" if use_mock else "real"

    variant_override = (
        model_variant_header if model_variant_header is not None else model_variant_form
    )
    variant_source = None
    if model_variant_header is not None:
        variant_source = "X-Model-Variant"
    elif model_variant_form is not None:
        variant_source = "model_variant form"

    result = analyze_frames(
        frames,
        calib,
        mock=use_mock,
        smoothing_window=query.smoothing_window,
        model_variant=variant_override,
        variant_source=variant_source,
    )
    events = result["events"]
    metrics_dict = dict(result["metrics"])
    if "confidence" not in metrics_dict:
        metrics_dict["confidence"] = 0.0
    metrics_model = AnalyzeMetrics(**metrics_dict)
    rec = None
    if query.persist:
        rec = save_run(
            source="video",
            mode="detector",
            params=query.model_dump(exclude_none=True),
            metrics=metrics_model.dict(),
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
        events=events, metrics=metrics_model, run_id=rec.run_id if rec else None
    )
