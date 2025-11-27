from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Mapping, Optional, Sequence, Tuple

PosePoint = Tuple[float, float, float]
PoseFrame = Mapping[str, PosePoint]


@dataclass
class SequenceOrder:
    """Ordering of angular velocity peaks during the downswing."""

    peak_order: List[str]
    is_ideal: bool


@dataclass
class KinematicSequence:
    """Summary of shoulder/hip rotation and kinematic sequence markers."""

    max_shoulder_rotation: Optional[float]
    max_hip_rotation: Optional[float]
    max_x_factor: Optional[float]
    shoulder_peak_frame: Optional[int]
    hip_peak_frame: Optional[int]
    x_factor_peak_frame: Optional[int]
    sequence_order: Optional[SequenceOrder] = None

    def dict(self) -> dict:
        return {
            "max_shoulder_rotation": self.max_shoulder_rotation,
            "max_hip_rotation": self.max_hip_rotation,
            "max_x_factor": self.max_x_factor,
            "shoulder_peak_frame": self.shoulder_peak_frame,
            "hip_peak_frame": self.hip_peak_frame,
            "x_factor_peak_frame": self.x_factor_peak_frame,
            "sequence_order": (
                {
                    "peak_order": self.sequence_order.peak_order,
                    "is_ideal": self.sequence_order.is_ideal,
                }
                if self.sequence_order
                else None
            ),
        }


def compute_line_angle(p1: PosePoint, p2: PosePoint) -> float:
    """Return line angle in degrees for segment p1->p2 using image plane coordinates."""

    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    return math.degrees(math.atan2(dy, dx))


def _collect_angles(
    frames: Sequence[PoseFrame], left_key: str, right_key: str
) -> List[Optional[float]]:
    angles: List[Optional[float]] = []
    for frame in frames:
        left = frame.get(left_key)
        right = frame.get(right_key)
        if left is None or right is None:
            angles.append(None)
            continue
        angles.append(compute_line_angle(left, right))
    return angles


def _collect_arm_angles(frames: Sequence[PoseFrame]) -> List[Optional[float]]:
    angles: List[Optional[float]] = []
    for frame in frames:
        shoulder = frame.get("right_shoulder") or frame.get("left_shoulder")
        wrist = frame.get("right_wrist") or frame.get("left_wrist")
        if shoulder is None or wrist is None:
            angles.append(None)
            continue
        angles.append(compute_line_angle(shoulder, wrist))
    return angles


def _collect_club_angles(club_track: Sequence[Tuple[float, float]]) -> List[float]:
    if not club_track:
        return []
    angles: List[float] = [0.0]
    for prev, curr in zip(club_track[:-1], club_track[1:]):
        angles.append(
            compute_line_angle((prev[0], prev[1], 0.0), (curr[0], curr[1], 0.0))
        )
    return angles


def _max_with_index(
    values: Sequence[Optional[float]],
) -> Tuple[Optional[float], Optional[int]]:
    max_value = None
    max_idx = None
    for idx, value in enumerate(values):
        if value is None:
            continue
        if max_value is None or abs(value) > abs(max_value):
            max_value = value
            max_idx = idx
    return max_value, max_idx


def _valid_series(series: Sequence[Optional[float]]) -> List[Tuple[int, float]]:
    return [(idx, value) for idx, value in enumerate(series) if value is not None]


def _peak_velocity_frame(
    series: Sequence[Optional[float]], start_idx: int, end_idx: int
) -> Optional[int]:
    if start_idx >= end_idx:
        return None
    valid = _valid_series(series)
    if len(valid) < 2:
        return None
    peak_frame = None
    peak_velocity = None
    for (i0, v0), (i1, v1) in zip(valid[:-1], valid[1:]):
        if i0 < start_idx or i1 > end_idx:
            continue
        dt = i1 - i0
        if dt <= 0:
            continue
        velocity = abs((v1 - v0) / dt)
        if peak_velocity is None or velocity > peak_velocity:
            peak_velocity = velocity
            peak_frame = i1
    return peak_frame


def analyze_kinematic_sequence(
    *,
    pose_history: Sequence[PoseFrame] | None,
    club_track: Sequence[Tuple[float, float]] | None = None,
    events: Sequence[int] | None = None,
) -> Optional[dict]:
    """Compute shoulder/hip rotation, X-factor, and a simple kinematic sequence order."""

    frames = list(pose_history or [])
    if len(frames) < 2:
        return None

    shoulder_angles = _collect_angles(frames, "left_shoulder", "right_shoulder")
    hip_angles = _collect_angles(frames, "left_hip", "right_hip")
    arm_angles = _collect_arm_angles(frames)
    club_angles = _collect_club_angles(list(club_track or []))

    x_factors: List[Optional[float]] = []
    for shoulder, hip in zip(shoulder_angles, hip_angles):
        if shoulder is None or hip is None:
            x_factors.append(None)
        else:
            x_factors.append(shoulder - hip)

    max_shoulder, shoulder_peak_frame = _max_with_index(shoulder_angles)
    max_hip, hip_peak_frame = _max_with_index(hip_angles)
    max_x_factor, x_factor_peak_frame = _max_with_index(x_factors)

    impact_frame = (events or [len(frames) - 1])[0]
    impact_frame = max(0, min(int(impact_frame), len(frames) - 1))
    top_frame = shoulder_peak_frame if shoulder_peak_frame is not None else 0
    if top_frame > impact_frame:
        top_frame = max(0, impact_frame - 1)

    def peak(series: Sequence[Optional[float]]) -> Optional[int]:
        return _peak_velocity_frame(series, top_frame, impact_frame)

    hip_peak_velocity = peak(hip_angles)
    shoulder_peak_velocity = peak(shoulder_angles)
    arm_peak_velocity = peak(arm_angles)
    if club_angles:
        padding = max(0, len(frames) - len(club_angles))
        club_series: Sequence[Optional[float]] = [None] * padding + club_angles
    else:
        club_series = [None] * len(frames)

    club_peak_velocity = peak(club_series)

    peak_frames = {
        "hips": hip_peak_velocity,
        "shoulders": shoulder_peak_velocity,
        "arms": arm_peak_velocity,
        "club": club_peak_velocity,
    }
    ordered = [
        label
        for label, frame in sorted(
            peak_frames.items(),
            key=lambda item: float("inf") if item[1] is None else item[1],
        )
        if peak_frames[label] is not None
    ]
    sequence_order = None
    if ordered:
        ideal = ordered == ["hips", "shoulders", "arms", "club"]
        sequence_order = SequenceOrder(peak_order=ordered, is_ideal=ideal)

    seq = KinematicSequence(
        max_shoulder_rotation=max_shoulder,
        max_hip_rotation=max_hip,
        max_x_factor=max_x_factor,
        shoulder_peak_frame=shoulder_peak_frame,
        hip_peak_frame=hip_peak_frame,
        x_factor_peak_frame=x_factor_peak_frame,
        sequence_order=sequence_order,
    )
    return seq.dict()
