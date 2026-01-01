from __future__ import annotations

import io
import os
import zipfile
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Response,
    UploadFile,
)
from pydantic import BaseModel, ConfigDict, Field
from fastapi.responses import JSONResponse
from starlette import status
from starlette.status import (
    HTTP_413_CONTENT_TOO_LARGE as HTTP_413_REQUEST_ENTITY_TOO_LARGE,
)

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
from server.services.cv_mock import effective_mock
from server.storage.runs import (
    RunSourceType,
    RunStatus,
    VariantOverrideSource,
    create_run,
    save_impact_frames,
    update_run,
)
from server.utils.model_variant import resolve_variant

router = APIRouter(prefix="/cv", tags=["cv"], dependencies=[Depends(require_api_key)])


class AnalyzeMetrics(BaseModel):
    ball_speed_mps: float = 0.0
    ball_speed_mph: float = 0.0
    club_speed_mps: float = 0.0
    club_speed_mph: float = 0.0
    launch_deg: float = 0.0
    carry_m: float = 0.0
    metrics_version: int = 1
    spin_rpm: float | None = None
    spin_axis_deg: float | None = None
    club_path_deg: float | None = None
    confidence: float = 0.0
    ballSpeedMps: float | None = None
    clubSpeedMps: float | None = None
    sideAngleDeg: float | None = None
    vertLaunchDeg: float | None = None
    carryEstM: float | None = None
    quality: dict[str, str] | None = None

    model_config = ConfigDict(extra="allow")


class AnalyzeQuery(BaseModel):
    fps: float = Field(120, gt=0)
    ref_len_m: float = Field(1.0, gt=0)
    ref_len_px: float = Field(100.0, gt=0)
    mode: str = "detector"  # "detector" | "tracks" ( tracks ej stödd här )
    smoothing_window: int = 3
    persist: bool = False
    run_name: str | None = None
    mock: bool | None = Field(
        default=None, description="Optional override for CV mock backend"
    )
    model_variant: str | None = Field(
        default=None, description="Optional override for YOLO model variant"
    )


class AnalyzeResponse(BaseModel):
    events: list[int]
    metrics: AnalyzeMetrics
    run_id: str
    error_code: str | None = None
    error_message: str | None = None


def _inference_timing(metrics: dict[str, Any]) -> dict[str, Any] | None:
    summary = metrics.get("inference")
    if not isinstance(summary, dict):
        return None
    return {
        "total_ms": summary.get("totalInferenceMs"),
        "avg_ms_per_frame": summary.get("avgInferenceMs"),
        "frame_count": summary.get("frames"),
    }


def _variant_source_label(source: VariantOverrideSource) -> str | None:
    mapping = {
        VariantOverrideSource.HEADER: "X-Model-Variant",
        VariantOverrideSource.FORM: "model_variant form",
        VariantOverrideSource.QUERY: "model_variant query",
        VariantOverrideSource.ENV_DEFAULT: "MODEL_VARIANT",
        VariantOverrideSource.PAYLOAD: "payload.model_variant",
    }
    return mapping.get(source)


def _fail_run(run_id: str, error_code: str, message: str, status_code: int):
    update_run(
        run_id,
        status=RunStatus.FAILED,
        error_code=error_code,
        error_message=message,
    )
    body = {"run_id": run_id, "error_code": error_code, "message": message}
    return JSONResponse(
        status_code=status_code,
        content={"detail": body},
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    response: Response,
    query: AnalyzeQuery = Depends(),
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
    frames_zip: UploadFile = File(..., description="ZIP med PNG/JPG eller .npy-filer"),
):
    data = await frames_zip.read(MAX_ZIP_SIZE_BYTES + 1)
    variant_info = resolve_variant(
        header=model_variant_header, form=model_variant_form, query=query.model_variant
    )
    use_mock = effective_mock(query.mock, mock_header, mock_form)
    response.headers["x-cv-source"] = "mock" if use_mock else "real"
    params = query.model_dump(exclude_none=True)
    params.pop("persist", None)
    run = create_run(
        source="mock" if use_mock else "real",
        source_type=RunSourceType.ANALYZE.value,
        mode=getattr(query, "mode", "detector"),
        status=RunStatus.PROCESSING,
        params=params,
        metrics={},
        events=[],
        model_variant_requested=variant_info.requested,
        model_variant_selected=variant_info.selected,
        override_source=variant_info.override_source.value,
        input_ref={
            "filename": frames_zip.filename,
            "content_length": len(data),
            "type": "zip",
        },
        metadata={"variant_fallback": variant_info.fallback_applied},
    )

    if len(data) > MAX_ZIP_SIZE_BYTES:
        return _fail_run(
            run.run_id,
            "ZIP_TOO_LARGE",
            "ZIP too large",
            HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            members = [m for m in zf.infolist() if not m.is_dir()]
            if len(members) > MAX_ZIP_FILES:
                return _fail_run(
                    run.run_id,
                    "ZIP_TOO_MANY_FILES",
                    "Too many files in ZIP",
                    HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
            uncompressed_sum = sum(m.file_size for m in members)
            compressed_sum = sum(m.compress_size for m in members)
            if any(m.file_size > MAX_ZIP_SIZE_BYTES for m in members):
                return _fail_run(
                    run.run_id,
                    "ZIP_FILE_TOO_LARGE",
                    "File too large in ZIP",
                    HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
            if compressed_sum == 0 and uncompressed_sum > 0:
                return _fail_run(
                    run.run_id,
                    "ZIP_RATIO_INVALID",
                    "ZIP compression ratio too high",
                    HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
            if compressed_sum > 0:
                ratio = uncompressed_sum / compressed_sum
                if ratio > MAX_ZIP_RATIO:
                    return _fail_run(
                        run.run_id,
                        "ZIP_RATIO_INVALID",
                        "ZIP compression ratio too high",
                        HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    )
            allowed_ext = {".npy", ".png", ".jpg", ".jpeg"}
            for member in members:
                ext = os.path.splitext(member.filename)[1].lower()
                if ext not in allowed_ext:
                    return _fail_run(
                        run.run_id,
                        "ZIP_INVALID_TYPE",
                        "Invalid file type in ZIP",
                        status.HTTP_400_BAD_REQUEST,
                    )
    except zipfile.BadZipFile:
        return _fail_run(
            run.run_id, "INVALID_ZIP", "Invalid ZIP file", status.HTTP_400_BAD_REQUEST
        )

    frames = frames_from_zip_bytes(data)
    if len(frames) < 2:
        return _fail_run(
            run.run_id,
            "INSUFFICIENT_FRAMES",
            "Need >=2 frames in ZIP (.npy or images).",
            status.HTTP_400_BAD_REQUEST,
        )
    calib = CalibrationParams.from_reference(
        query.ref_len_m, query.ref_len_px, query.fps
    )

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
            return _fail_run(
                run.run_id,
                "YOLOV11_UNAVAILABLE",
                "YOLOv11 unavailable; try yolov10",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return _fail_run(
            run.run_id,
            "ANALYZE_FAILED",
            "Analysis failed",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except Exception:
        return _fail_run(
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
            "filename": frames_zip.filename,
            "content_length": len(data),
            "frame_count": len(frames),
            "type": "zip",
        },
        impact_preview=impact_preview,
    )
    return AnalyzeResponse(
        events=events,
        metrics=metrics_model,
        run_id=run.run_id,
    )
