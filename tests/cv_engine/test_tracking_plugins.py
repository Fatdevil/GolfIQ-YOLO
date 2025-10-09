from __future__ import annotations

import pytest

from cv_engine.tracking.factory import get_tracker
from cv_engine.types import Box

TRACKERS = ["identity", "bytetrack", "norfair"]


@pytest.mark.parametrize("name", TRACKERS)
def test_tracker_ids_stable_across_gap(name: str) -> None:
    tracker = get_tracker(name=name)
    frames = [
        [Box(0, 0, 10, 10, label="ball", score=0.9)],
        [],
        [Box(0, 0, 10, 10, label="ball", score=0.92)],
    ]

    seen_ids: list[int] = []
    for boxes in frames:
        updates = tracker.update(boxes)
        if updates:
            seen_ids.append(updates[0][0])

    assert len(seen_ids) >= 2
    first, last = seen_ids[0], seen_ids[-1]
    assert first == last, f"tracker {name} failed to keep id across gap"


@pytest.mark.parametrize("name", TRACKERS)
def test_tracker_reset(name: str) -> None:
    tracker = get_tracker(name=name)
    first_update = tracker.update([Box(0, 0, 5, 5, label="club")])
    assert first_update, f"{name} tracker did not return an id"
    tracker.reset()
    second_update = tracker.update([Box(0, 0, 5, 5, label="club")])
    assert second_update[0][0] == 1
