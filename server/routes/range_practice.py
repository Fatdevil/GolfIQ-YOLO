"""Range practice API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from server.cv.range_analyze import RangeAnalyzeIn, RangeAnalyzeOut, run_range_analyze
from server.security import require_api_key
from server.storage.runs import RunSourceType, RunStatus, create_run, update_run
from server.utils.model_variant import resolve_variant
from .cv_analyze import _fail_run, _inference_timing, _variant_source_label

router = APIRouter(
    prefix="/range/practice",
    tags=["range-practice"],
    dependencies=[Depends(require_api_key)],
)


@router.post("/analyze", response_model=RangeAnalyzeOut)
def analyze_range_capture(payload: RangeAnalyzeIn) -> RangeAnalyzeOut:
    """Analyze a range capture using the configured CV backend."""

    variant_info = resolve_variant(payload=payload.model_variant)
    params = payload.model_dump(exclude_none=True)
    frames_zip = params.pop("frames_zip_b64", None)
    if frames_zip is not None:
        params["frames_zip_b64_len"] = len(frames_zip)
    run = create_run(
        source="range",
        source_type=RunSourceType.RANGE.value,
        mode=payload.mode,
        status=RunStatus.PROCESSING,
        params=params,
        metrics={},
        events=[],
        model_variant_requested=variant_info.requested,
        model_variant_selected=variant_info.selected,
        override_source=variant_info.override_source.value,
        input_ref={
            "frames_zip_b64_len": len(frames_zip) if frames_zip else 0,
            "frames_hint": payload.frames,
            "type": "range",
        },
        metadata={"variant_fallback": variant_info.fallback_applied},
    )
    try:
        out, metrics, events, backend = run_range_analyze(
            payload,
            return_raw=True,
            model_variant=variant_info.selected,
            variant_source=_variant_source_label(variant_info.override_source),
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

    timing = _inference_timing(metrics if isinstance(metrics, dict) else {}) or {}
    update_run(
        run.run_id,
        status=RunStatus.SUCCEEDED,
        metrics=metrics if isinstance(metrics, dict) else {},
        events=list(events),
        inference_timing=timing,
        model_variant_selected=variant_info.selected,
        source=getattr(backend, "name", str(backend)).lower(),
        input_ref={
            "frames_zip_b64_len": len(frames_zip) if frames_zip else 0,
            "frames_hint": payload.frames,
            "type": "range",
        },
    )
    return out.model_copy(update={"run_id": run.run_id})


__all__ = ["router"]
