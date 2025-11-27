import math

import pytest

from cv_engine.sequence.rotation_sequence import analyze_kinematic_sequence


def _pose_frame(shoulder_angle: float, hip_angle: float, arm_angle: float):
    def line_points(
        angle: float,
    ) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
        rad = math.radians(angle)
        return (
            (-math.cos(rad), -math.sin(rad), 0.9),
            (math.cos(rad), math.sin(rad), 0.9),
        )

    left_shoulder, right_shoulder = line_points(shoulder_angle)
    left_hip, right_hip = line_points(hip_angle)
    wrist_rad = math.radians(arm_angle)
    wrist = (
        right_shoulder[0] + math.cos(wrist_rad),
        right_shoulder[1] + math.sin(wrist_rad),
        0.7,
    )
    return {
        "left_shoulder": left_shoulder,
        "right_shoulder": right_shoulder,
        "left_hip": left_hip,
        "right_hip": right_hip,
        "right_wrist": wrist,
    }


def _club_track_from_headings(headings: list[float]):
    pos = (0.0, 0.0)
    positions = []
    for angle in headings:
        rad = math.radians(angle)
        pos = (pos[0] + math.cos(rad), pos[1] + math.sin(rad))
        positions.append(pos)
    return positions


def test_sequence_metrics_and_order():
    shoulder_angles = [0, 8, 28, 24, 16, 8, 2]
    hip_angles = [0, 5, 18, 10, 4, 0, -2]
    arm_angles = [0, 6, 24, 22, 18, 12, 6]
    frames = [
        _pose_frame(s, h, a) for s, h, a in zip(shoulder_angles, hip_angles, arm_angles)
    ]
    club_track = _club_track_from_headings([0, 4, 26, 24, 22, 18, 10])

    result = analyze_kinematic_sequence(
        pose_history=frames, club_track=club_track, events=[6]
    )

    assert result is not None
    assert result["max_shoulder_rotation"] == pytest.approx(28)
    assert result["max_hip_rotation"] == pytest.approx(18)
    assert result["max_x_factor"] == pytest.approx(14)
    assert result["sequence_order"] == {
        "peak_order": ["hips", "shoulders", "arms", "club"],
        "is_ideal": True,
    }


def test_sequence_handles_missing_history():
    assert analyze_kinematic_sequence(pose_history=None) is None
    assert analyze_kinematic_sequence(pose_history=[]) is None
