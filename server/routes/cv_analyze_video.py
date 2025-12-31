from __future__ import annotations

from tempfile import SpooledTemporaryFile

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Query,
    Response,
    UploadFile,
)
from pydantic import BaseModel, Field
from starlette import status
from starlette.status import (
    HTTP_413_CONTENT_TOO_LARGE as HTTP_413_REQUEST_ENTITY_TOO_LARGE,
)

from cv_engine.io.videoreader import fps_from_video, frames_from_video
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames
from .cv_analyze import (
    AnalyzeMetrics,
    _fail_run,
    _inference_timing,
    _variant_source_label,
)
from server.config import (
    CAPTURE_IMPACT_FRAMES,
    IMPACT_CAPTURE_AFTER,
    IMPACT_CAPTURE_BEFORE,
    MAX_VIDEO_BYTES,
)
from server.security import require_api_key
from server.services.cv_mock import effective_mock
from server.storage.runs import (
    RunSourceType,
    RunStatus,
    create_run,
    save_impact_frames,
    update_run,
)
from server.utils.model_variant import resolve_variant

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
    run_id: str
    error_code: str | None = None
    error_message: str | None = None


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
    variant_info = resolve_variant(
        header=model_variant_header, form=model_variant_form, query=None
    )
    use_mock = effective_mock(mock, mock_header, mock_form)
    response.headers["x-cv-source"] = "mock" if use_mock else "real"
    params = query.model_dump(exclude_none=True)
    params.pop("persist", None)
    run = create_run(
        source="mock" if use_mock else "real",
        source_type=RunSourceType.ANALYZE_VIDEO.value,
        mode="detector",
        status=RunStatus.PROCESSING,
        params=params,
        metrics={},
        events=[],
        model_variant_requested=variant_info.requested,
        model_variant_selected=variant_info.selected,
        override_source=variant_info.override_source.value,
        input_ref={
            "filename": video.filename,
            "content_length_header": video.headers.get("content-length"),
            "type": "video",
        },
        metadata={"variant_fallback": variant_info.fallback_applied},
    )

    header_len = video.headers.get("content-length")
    if header_len:
        try:
            if int(header_len) > MAX_VIDEO_BYTES:
                _fail_run(
                    run.run_id,
                    "VIDEO_TOO_LARGE",
                    "Video too large",
                    HTTP_413_REQUEST_ENTITY_TOO_LARGE,
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
                _fail_run(
                    run.run_id,
                    "VIDEO_TOO_LARGE",
                    "Video too large",
                    HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
            tmp.write(chunk)
        tmp.seek(0)
        data = tmp.read()
    try:
        frames = frames_from_video(data, max_frames=300, stride=1)
    except ImportError:
        _fail_run(
            run.run_id,
            "VIDEO_DECODE_DEP_MISSING",
            "Video extras not installed. Install with: pip install -e '.[video]'",
            status.HTTP_400_BAD_REQUEST,
        )
    except RuntimeError as exc:
        _fail_run(
            run.run_id,
            "VIDEO_DECODE_FAILED",
            f"Could not decode video: {exc}",
            status.HTTP_400_BAD_REQUEST,
        )
    except Exception:
        _fail_run(
            run.run_id,
            "VIDEO_DECODE_ERROR",
            "Video decode error",
            status.HTTP_400_BAD_REQUEST,
        )
    if len(frames) < 2:
        _fail_run(
            run.run_id,
            "VIDEO_DECODE_FAILED",
            "Could not decode video or not enough frames.",
            status.HTTP_400_BAD_REQUEST,
        )

    fps = fps_from_video(data) or float(query.fps_fallback)
    calib = CalibrationParams.from_reference(query.ref_len_m, query.ref_len_px, fps)

    variant_source = _variant_source_label(variant_info.override_source)
    try:
        result = analyze_frames(
            frames,
            calib,
            mock=use_mock,
            smoothing_window=query.smoothing_window,
            model_variant=variant_info.selected,
            variant_source=variant_source,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "yolov11" in message.lower():
            _fail_run(
                run.run_id,
                "YOLOV11_UNAVAILABLE",
                "YOLOv11 unavailable; try yolov10",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        _fail_run(
            run.run_id,
            "ANALYZE_FAILED",
            "Analysis failed",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except Exception:
        _fail_run(
            run.run_id,
            "ANALYZE_FAILED",
            "Analysis failed",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    events = result["events"]
    metrics_dict = dict(result["metrics"])
    if "confidence" not in metrics_dict:
        metrics_dict["confidence"] = 0.0
    timing = _inference_timing(metrics_dict) or {}
    metrics_model = AnalyzeMetrics(**metrics_dict)
    impact_preview = None
    impact_idx = events[0] if events else None
    if CAPTURE_IMPACT_FRAMES and impact_idx is not None:
        start = max(0, impact_idx - IMPACT_CAPTURE_BEFORE)
        stop = min(len(frames), impact_idx + IMPACT_CAPTURE_AFTER)
        if stop > start:
            impact_preview = save_impact_frames(run.run_id, frames[start:stop])

    update_run(
        run.run_id,
        status=RunStatus.SUCCEEDED,
        metrics=metrics_model.model_dump(),
        events=list(events),
        inference_timing=timing,
        model_variant_selected=variant_info.selected,
        input_ref={
            "filename": video.filename,
            "content_length": len(data),
            "frame_count": len(frames),
            "type": "video",
        },
        impact_preview=impact_preview,
    )
    return AnalyzeResponse(
        events=events,
        metrics=metrics_model,
        run_id=run.run_id,
    )
