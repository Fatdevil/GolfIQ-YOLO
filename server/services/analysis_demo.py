from __future__ import annotations

from typing import Any

import numpy as np

from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames
from cv_engine.ux import build_ux_payload_v1


_DEMO_FRAME_WIDTH = 64
_DEMO_FRAME_HEIGHT = 64
_DEMO_FRAME_COUNT = 12


def demo_summary(mode: str) -> str:
    normalized = mode.lower() if isinstance(mode, str) else "unknown"
    return f"demo mode: synthetic {normalized} analysis"


def run_demo_analysis(
    *,
    mode: str,
    fps: float,
    ref_len_m: float,
    ref_len_px: float,
    smoothing_window: int,
    frames: int | None = None,
    frame_width: int | None = None,
    frame_height: int | None = None,
) -> dict[str, Any]:
    frame_count = max(frames or _DEMO_FRAME_COUNT, 2)
    width = frame_width or _DEMO_FRAME_WIDTH
    height = frame_height or _DEMO_FRAME_HEIGHT
    synthetic_frames = [
        np.zeros((height, width, 3), dtype=np.uint8) for _ in range(frame_count)
    ]
    calib = CalibrationParams.from_reference(ref_len_m, ref_len_px, fps)
    return analyze_frames(
        synthetic_frames,
        calib,
        mock=True,
        smoothing_window=smoothing_window,
        mode=mode,
    )


def ensure_ux_payload(metrics: dict[str, Any], *, mode: str) -> dict[str, Any]:
    existing = metrics.get("ux_payload_v1")
    if isinstance(existing, dict):
        return existing

    range_mode_hud = metrics.get("range_mode_hud")
    capture_quality = metrics.get("capture_quality")
    if range_mode_hud is None and isinstance(capture_quality, dict):
        range_mode_hud = capture_quality.get("range_mode_hud")

    payload = build_ux_payload_v1(
        range_mode_hud=range_mode_hud,
        explain_result=metrics.get("explain_result"),
        micro_coach=metrics.get("micro_coach"),
        mode=mode,
    )
    metrics["ux_payload_v1"] = payload
    return payload


__all__ = ["demo_summary", "run_demo_analysis", "ensure_ux_payload"]
