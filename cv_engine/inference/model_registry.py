from __future__ import annotations

import logging
import os
from typing import Any, Dict, Type

from .detection_engine import DetectionEngine
from .yolov10 import YoloV10Engine
from .yolov11 import YoloV11Engine

DEFAULT_MODEL_VARIANT = "yolov10"
ALLOWED_VARIANTS: Dict[str, Type[DetectionEngine]] = {
    "yolov10": YoloV10Engine,
    "yolov11": YoloV11Engine,
}

logger = logging.getLogger(__name__)


def _normalize_variant(raw: str | None) -> str:
    if raw is None:
        return DEFAULT_MODEL_VARIANT
    normalized = raw.strip().lower()
    if normalized in ALLOWED_VARIANTS:
        return normalized
    logger.warning(
        "Unknown MODEL_VARIANT '%s'; falling back to '%s'",
        raw,
        DEFAULT_MODEL_VARIANT,
    )
    return DEFAULT_MODEL_VARIANT


def get_detection_engine(
    *, variant: str | None = None, weight_path: str | None = None, **kwargs: Any
) -> DetectionEngine:
    """Return the configured detection engine.

    The selection is driven by MODEL_VARIANT (env or explicit argument).
    Invalid values fall back to the safe default (yolov10) with a warning.
    """

    selected = _normalize_variant(
        variant if variant is not None else os.getenv("MODEL_VARIANT")
    )
    engine_cls = ALLOWED_VARIANTS[selected]
    resolved_weight_path = (
        weight_path if weight_path is not None else os.getenv("YOLO_MODEL_PATH")
    )
    return engine_cls(weight_path=resolved_weight_path, **kwargs)
