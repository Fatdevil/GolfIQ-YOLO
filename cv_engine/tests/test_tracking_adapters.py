from __future__ import annotations

from cv_engine.tracking.bytetrack import ByteTrackTracker
from cv_engine.tracking.factory import get_tracker
from cv_engine.tracking.norfair import NorfairTracker
from cv_engine.types import Box


def _generate_sequence(frames: int = 5):
    for idx in range(frames):
        offset = idx * 4
        yield [
            Box(100 + offset, 200, 130 + offset, 230, "ball", 0.95),
            Box(400 + offset, 500, 460 + offset, 620, "club", 0.92),
        ]


def _collect_ids(tracker, sequence):
    ids = {"ball": [], "club": []}
    for boxes in sequence:
        tracked = tracker.update(boxes)
        for track_id, box in tracked:
            ids[box.label].append(track_id)
    return ids


def test_bytetrack_consistent_ids():
    tracker = ByteTrackTracker()
    seq = list(_generate_sequence())
    ids = _collect_ids(tracker, seq)
    assert len(set(ids["ball"])) == 1
    assert len(set(ids["club"])) == 1


def test_norfair_consistent_ids():
    tracker = NorfairTracker(distance_threshold=100.0)
    seq = list(_generate_sequence())
    ids = _collect_ids(tracker, seq)
    assert len(set(ids["ball"])) == 1
    assert len(set(ids["club"])) == 1


def test_factory_env(monkeypatch):
    monkeypatch.setenv("GOLFIQ_TRACKER", "identity")
    tracker = get_tracker()
    seq = list(_generate_sequence())
    tracked = [tracker.update(boxes) for boxes in seq]
    assert all(len(frame) == 2 for frame in tracked)
    # ensure env reset does not bleed into rest of suite
    monkeypatch.delenv("GOLFIQ_TRACKER")
