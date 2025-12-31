"""Unified helpers for range practice CV analysis."""

from __future__ import annotations

import base64
import logging
from typing import Any, Dict, Iterable, Mapping

import numpy as np
from pydantic import BaseModel, Field

from cv_engine.io.framesource import frames_from_zip_bytes
from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames

from server.routes import cv_mock

from .config import CvBackend, get_range_backend

LOGGER = logging.getLogger(__name__)


class RangeAnalyzeIn(BaseModel):
    """Payload accepted by the range practice analyzer."""

    frames: int = Field(8, ge=2, le=300)
    fps: float = Field(120.0, gt=0)
    ref_len_m: float = Field(1.0, gt=0)
    ref_len_px: float = Field(100.0, gt=0)
    ball_dx_px: float | None = None
    ball_dy_px: float | None = None
    club_dx_px: float | None = None
    club_dy_px: float | None = None
    mode: str = "tracks"
    persist: bool = False
    run_name: str | None = None
    smoothing_window: int = Field(3, ge=1, le=25)
    frame_width: int = Field(1280, ge=16, le=4096)
    frame_height: int = Field(720, ge=16, le=4096)
    frames_zip_b64: str | None = Field(
        default=None, description="Optional base64-encoded ZIP with captured frames"
    )
    mission_id: str | None = Field(
        default=None,
        description="Optional mission identifier used by the client for range missions",
    )
    model_variant: str | None = Field(
        default=None, description="Optional override for YOLO model variant"
    )


class CameraFitness(BaseModel):
    score: float
    level: str
    reasons: list[str] = Field(default_factory=list)


class RangeAnalyzeOut(BaseModel):
    ball_speed_mps: float | None = None
    ball_speed_mph: float | None = None
    club_speed_mps: float | None = None
    club_speed_mph: float | None = None
    carry_m: float | None = None
    launch_deg: float | None = None
    side_deg: float | None = None
    quality: CameraFitness | None = None
    run_id: str | None = None


_QUALITY_REASON_MAP: Dict[str, str] = {
    "fps": "fps_low",
    "lighting": "light_low",
    "homography": "mpx_low",
}

_QUALITY_SCORE_MAP: Dict[str, float] = {"good": 1.0, "warn": 0.6, "low": 0.2}


def _camera_fitness_from_quality(
    data: Mapping[str, Any] | None,
) -> CameraFitness | None:
    if not data:
        return None
    levels = [str(value) for value in data.values() if value is not None]
    if not levels:
        return None
    normalized = []
    for value in levels:
        key = value.lower()
        if key not in _QUALITY_SCORE_MAP:
            continue
        normalized.append(key)
    if not normalized:
        return None
    level: str
    if "low" in normalized:
        level = "bad"
    elif "warn" in normalized:
        level = "warning"
    else:
        level = "good"
    score = sum(_QUALITY_SCORE_MAP[val] for val in normalized) / len(normalized)
    reasons: list[str] = []
    for key, value in data.items():
        if value is None:
            continue
        value_str = str(value).lower()
        if value_str not in ("warn", "low"):
            continue
        reasons.append(_QUALITY_REASON_MAP.get(str(key), str(key)))
    return CameraFitness(
        score=round(score, 3), level=level, reasons=sorted(set(reasons))
    )


def _maybe_float(metrics: Mapping[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = metrics.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _build_out(metrics: Mapping[str, Any]) -> RangeAnalyzeOut:
    ball_speed_mps = _maybe_float(metrics, "ball_speed_mps", "ballSpeedMps")
    ball_speed_mph = _maybe_float(metrics, "ball_speed_mph", "ballSpeedMph")
    club_speed_mps = _maybe_float(metrics, "club_speed_mps", "clubSpeedMps")
    club_speed_mph = _maybe_float(metrics, "club_speed_mph", "clubSpeedMph")
    carry_m = _maybe_float(metrics, "carry_m", "carryEstM")
    launch_deg = _maybe_float(metrics, "launch_deg", "vertLaunchDeg")
    side_deg = _maybe_float(metrics, "side_deg", "side_angle_deg", "sideAngleDeg")
    quality_raw = metrics.get("quality") if isinstance(metrics, Mapping) else None
    camera = _camera_fitness_from_quality(
        quality_raw if isinstance(quality_raw, Mapping) else None
    )
    return RangeAnalyzeOut(
        ball_speed_mps=ball_speed_mps,
        ball_speed_mph=ball_speed_mph,
        club_speed_mps=club_speed_mps,
        club_speed_mph=club_speed_mph,
        carry_m=carry_m,
        launch_deg=launch_deg,
        side_deg=side_deg,
        quality=camera,
    )


def _frames_from_payload(payload: RangeAnalyzeIn) -> Iterable[np.ndarray]:
    if payload.frames_zip_b64:
        try:
            data = base64.b64decode(payload.frames_zip_b64)
            frames = list(frames_from_zip_bytes(data))
            if len(frames) >= 2:
                return frames
            LOGGER.warning(
                "Decoded frames ZIP but got <2 frames; falling back to blanks"
            )
        except Exception as exc:  # pragma: no cover - defensive logging
            LOGGER.warning("Failed to decode frames ZIP for range analyze: %s", exc)
    height = payload.frame_height
    width = payload.frame_width
    count = max(payload.frames, 2)
    return [np.zeros((height, width, 3), dtype=np.uint8) for _ in range(count)]


def run_mock_analyze(
    payload: RangeAnalyzeIn, *, return_raw: bool = False
) -> RangeAnalyzeOut | tuple[RangeAnalyzeOut, Mapping[str, Any]]:
    """Run the mock CV analyzer and normalize the response."""

    request_data = payload.model_dump(exclude_none=True)
    request_data.pop("model_variant", None)
    mock_request = cv_mock.AnalyzeRequest(**request_data)
    mock_response = cv_mock.analyze(mock_request)
    metrics: Mapping[str, Any]
    if isinstance(mock_response.metrics, Mapping):
        metrics = dict(mock_response.metrics)
    else:  # pragma: no cover - defensive fallback
        metrics = {}
    out = _build_out(metrics)
    if return_raw:
        return out, metrics
    return out


def run_real_analyze(
    payload: RangeAnalyzeIn,
    *,
    return_raw: bool = False,
    model_variant: str | None = None,
    variant_source: str | None = None,
) -> RangeAnalyzeOut | tuple[RangeAnalyzeOut, Mapping[str, Any], list[int]]:
    """Run the real CV analyzer and normalize the response."""

    calib = CalibrationParams.from_reference(
        payload.ref_len_m, payload.ref_len_px, payload.fps
    )
    frames = _frames_from_payload(payload)
    result = analyze_frames(
        frames,
        calib,
        mock=False,
        smoothing_window=payload.smoothing_window,
        model_variant=model_variant or payload.model_variant,
        variant_source=variant_source
        or ("range_analyze.model_variant" if payload.model_variant else None),
    )
    metrics_obj = result.get("metrics", {})
    metrics = dict(metrics_obj) if isinstance(metrics_obj, Mapping) else {}
    out = _build_out(metrics)
    if return_raw:
        return out, metrics, result.get("events", [])
    return out


def run_range_analyze(
    payload: RangeAnalyzeIn,
    *,
    return_raw: bool = False,
    model_variant: str | None = None,
    variant_source: str | None = None,
) -> RangeAnalyzeOut | tuple[RangeAnalyzeOut, Mapping[str, Any], list[int], CvBackend]:
    """Dispatch to the configured backend and return normalized metrics."""

    backend = get_range_backend()
    if backend == CvBackend.MOCK:
        try:
            result = run_mock_analyze(payload, return_raw=return_raw)
        except TypeError:
            result = run_mock_analyze(payload)  # type: ignore[call-arg]
        if return_raw:
            if isinstance(result, tuple):
                out, metrics = result  # type: ignore[misc]
            else:
                out, metrics = result, {}
            return out, metrics, [], backend
        return result
    try:
        result = run_real_analyze(
            payload,
            return_raw=return_raw,
            model_variant=model_variant,
            variant_source=variant_source
            or ("range_analyze.model_variant" if payload.model_variant else None),
        )
    except TypeError:
        result = run_real_analyze(payload)  # type: ignore[call-arg]
    if return_raw:
        if isinstance(result, tuple):
            out, metrics, events = result  # type: ignore[misc]
        else:
            out, metrics, events = result, {}, []
        return out, metrics, events, backend
    return result


__all__ = [
    "CameraFitness",
    "RangeAnalyzeIn",
    "RangeAnalyzeOut",
    "run_range_analyze",
    "run_mock_analyze",
    "run_real_analyze",
]
