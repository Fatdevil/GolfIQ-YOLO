import numpy as np

from cv_engine.capture.quality import analyze_capture_quality


def _checkerboard(size: int = 720, tile: int = 16) -> np.ndarray:
    grid = np.indices((size, size)).sum(axis=0) // tile
    board = (grid % 2) * 255
    return np.stack([board, board, board], axis=-1).astype(np.uint8)


def _box_blur(frame: np.ndarray) -> np.ndarray:
    padded = np.pad(frame.astype(np.float32), ((1, 1), (1, 1), (0, 0)), mode="edge")
    blurred = (
        padded[:-2, :-2]
        + padded[:-2, 1:-1]
        + padded[:-2, 2:]
        + padded[1:-1, :-2]
        + padded[1:-1, 1:-1]
        + padded[1:-1, 2:]
        + padded[2:, :-2]
        + padded[2:, 1:-1]
        + padded[2:, 2:]
    ) / 9.0
    return blurred.astype(np.uint8)


def _issue_codes(report) -> set[str]:
    return {issue.code for issue in report.issues}


def test_low_resolution_triggers_issue():
    frames = [np.zeros((480, 640, 3), dtype=np.uint8) for _ in range(3)]
    report = analyze_capture_quality(frames, fps=120.0)
    assert "LOW_RESOLUTION" in _issue_codes(report)


def test_underexposed_triggers_issue():
    frames = [np.zeros((720, 1280, 3), dtype=np.uint8) for _ in range(4)]
    report = analyze_capture_quality(frames, fps=120.0)
    assert "UNDEREXPOSED" in _issue_codes(report)


def test_motion_blur_triggers_issue():
    sharp = _checkerboard()
    blurred = _box_blur(_box_blur(_box_blur(_box_blur(sharp))))
    frames = [blurred for _ in range(5)]
    report = analyze_capture_quality(frames, fps=120.0)
    assert "MOTION_BLUR" in _issue_codes(report)


def test_camera_shake_detection():
    base = _checkerboard(size=720, tile=24)
    stable_report = analyze_capture_quality([base for _ in range(4)], fps=120.0)
    assert "CAMERA_SHAKE" not in _issue_codes(stable_report)

    shaky_frames = [
        base,
        np.roll(base, 30, axis=1),
        base,
        np.roll(base, -30, axis=1),
    ]
    shaky_report = analyze_capture_quality(shaky_frames, fps=120.0)
    assert "CAMERA_SHAKE" in _issue_codes(shaky_report)


def test_report_serialization():
    base = np.zeros((720, 1280, 3), dtype=np.uint8)
    report = analyze_capture_quality([base for _ in range(2)], fps=120.0)
    data = report.to_dict()
    assert set(data.keys()) == {"score", "summary", "issues", "recommendations"}
    assert isinstance(data["score"], int)
    assert isinstance(data["summary"], dict)
    assert isinstance(data["issues"], list)
    assert isinstance(data["recommendations"], list)
