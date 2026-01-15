from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Sequence

from .types import CalibrationConfig, Point


@dataclass(frozen=True)
class ScaleResult:
    meters_per_pixel: float | None
    scale_px_per_meter: float | None
    reason_codes: list[str] = field(default_factory=list)


def resolve_scale(config: CalibrationConfig) -> ScaleResult:
    if not config.enabled:
        return ScaleResult(None, None, ["disabled"])

    reason_codes: list[str] = []
    scale_px_per_meter = config.scale_px_per_meter
    meters_per_pixel = config.meters_per_pixel

    if scale_px_per_meter is not None:
        if scale_px_per_meter <= 0:
            return ScaleResult(None, None, ["invalid_scale"])
        meters_per_pixel = 1.0 / scale_px_per_meter
    elif meters_per_pixel is not None:
        if meters_per_pixel <= 0:
            return ScaleResult(None, None, ["invalid_scale"])
        scale_px_per_meter = 1.0 / meters_per_pixel
    else:
        if config.reference_distance_m is None or config.reference_points_px is None:
            return ScaleResult(None, None, ["missing_scale"])
        (x1, y1), (x2, y2) = config.reference_points_px
        dist_px = math.hypot(x2 - x1, y2 - y1)
        if dist_px <= 0:
            return ScaleResult(None, None, ["invalid_reference"])
        meters_per_pixel = config.reference_distance_m / dist_px
        if meters_per_pixel <= 0:
            return ScaleResult(None, None, ["invalid_scale"])
        scale_px_per_meter = 1.0 / meters_per_pixel

    if meters_per_pixel is None or scale_px_per_meter is None:
        return ScaleResult(None, None, ["missing_scale"])

    return ScaleResult(float(meters_per_pixel), float(scale_px_per_meter), reason_codes)


def points_px_to_meters(
    points_px: Sequence[Point],
    *,
    meters_per_pixel: float,
    origin_px: Point | None = None,
    invert_y: bool = True,
) -> list[Point]:
    if meters_per_pixel <= 0:
        return []
    if origin_px is None and points_px:
        origin_px = points_px[0]
    if origin_px is None:
        return []
    origin_x, origin_y = origin_px
    points_m: list[Point] = []
    for x_px, y_px in points_px:
        dx = (x_px - origin_x) * meters_per_pixel
        dy_px = y_px - origin_y
        dy = (-dy_px if invert_y else dy_px) * meters_per_pixel
        points_m.append((dx, dy))
    return points_m
