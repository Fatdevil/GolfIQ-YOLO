from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

import numpy as np

from .types import LaunchWindowResult, TrackPoint


@dataclass(frozen=True)
class LaunchWindowConfig:
    max_gap_frames: int = 4
    min_points: int = 4
    max_points: int = 12


def _step_distances(points: Sequence[TrackPoint]) -> list[float]:
    return [
        math.hypot(
            points[i].x_px - points[i - 1].x_px,
            points[i].y_px - points[i - 1].y_px,
        )
        for i in range(1, len(points))
    ]


def _segments(points: Sequence[TrackPoint], max_gap_frames: int) -> list[list[int]]:
    if not points:
        return []
    segments = [[0]]
    for idx in range(1, len(points)):
        prev = points[idx - 1].frame_idx
        cur = points[idx].frame_idx
        if cur - prev > max_gap_frames:
            segments.append([idx])
        else:
            segments[-1].append(idx)
    return segments


def detect_launch_window(
    points: Sequence[TrackPoint],
    *,
    config: LaunchWindowConfig | None = None,
) -> LaunchWindowResult:
    config = config or LaunchWindowConfig()
    if len(points) < config.min_points:
        return LaunchWindowResult(
            start_index=None,
            end_index=None,
            start_frame=None,
            end_frame=None,
            confidence=0.0,
            reason_codes=["launch_window_too_short"],
        )

    points_sorted = sorted(points, key=lambda p: p.frame_idx)
    segments = _segments(points_sorted, config.max_gap_frames)
    if not segments:
        return LaunchWindowResult(
            start_index=None,
            end_index=None,
            start_frame=None,
            end_frame=None,
            confidence=0.0,
            reason_codes=["launch_window_too_short"],
        )

    chosen: list[int] | None = None
    for segment in segments:
        if len(segment) >= config.min_points:
            chosen = segment
            break
    if chosen is None:
        chosen = max(segments, key=len)
        if len(chosen) < config.min_points:
            return LaunchWindowResult(
                start_index=None,
                end_index=None,
                start_frame=None,
                end_frame=None,
                confidence=0.1,
                reason_codes=["launch_window_too_short"],
            )

    segment_points = [points_sorted[idx] for idx in chosen]
    steps = _step_distances(segment_points)
    if not steps:
        return LaunchWindowResult(
            start_index=chosen[0],
            end_index=chosen[0],
            start_frame=segment_points[0].frame_idx,
            end_frame=segment_points[0].frame_idx,
            confidence=0.1,
            reason_codes=["insufficient_motion"],
        )

    median_step = float(np.median(steps)) if steps else 0.0
    min_step = max(median_step * 0.5, 0.75)
    max_step = max(median_step * 6.0, min_step * 3.0, 5.0)

    inlier_indices = [
        idx for idx, step in enumerate(steps, start=1) if min_step <= step <= max_step
    ]
    if not inlier_indices:
        return LaunchWindowResult(
            start_index=chosen[0],
            end_index=chosen[-1],
            start_frame=segment_points[0].frame_idx,
            end_frame=segment_points[-1].frame_idx,
            confidence=0.2,
            reason_codes=["insufficient_motion"],
        )

    start_offset = max(inlier_indices[0] - 1, 0)
    end_offset = inlier_indices[-1]
    start_index = chosen[start_offset]
    end_index = chosen[end_offset]

    if config.max_points:
        end_index = min(end_index, start_index + config.max_points - 1)

    if end_index < start_index:
        return LaunchWindowResult(
            start_index=None,
            end_index=None,
            start_frame=None,
            end_frame=None,
            confidence=0.0,
            reason_codes=["launch_window_too_short"],
        )

    start_frame = points_sorted[start_index].frame_idx
    end_frame = points_sorted[end_index].frame_idx
    length = max(1, end_index - start_index + 1)
    coverage = length / max(config.max_points, 1)
    confidence = max(0.2, min(1.0, coverage))
    reason_codes: list[str] = []
    if length < config.min_points:
        reason_codes.append("launch_window_too_short")
    if end_frame - start_frame > config.max_points:
        reason_codes.append("launch_window_gap")

    return LaunchWindowResult(
        start_index=start_index,
        end_index=end_index,
        start_frame=start_frame,
        end_frame=end_frame,
        confidence=confidence,
        reason_codes=reason_codes,
    )
