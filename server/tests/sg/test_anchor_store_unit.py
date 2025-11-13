from __future__ import annotations

import pytest

from server.sg.anchors import AnchorIn, get_anchor, list_anchors, upsert_anchors
from server.services.anchors_store import _reset_state as reset_anchors


@pytest.fixture(autouse=True)
def _clear_store() -> None:
    reset_anchors()
    yield
    reset_anchors()


def test_upsert_creates_and_updates_version() -> None:
    run_id = "run-store"
    anchor_in = AnchorIn(hole=1, shot=1, clip_id="clip-1", t_start_ms=100, t_end_ms=400)

    created = upsert_anchors(run_id, [anchor_in])[0]
    assert created.version == 1

    same = upsert_anchors(run_id, [anchor_in])[0]
    assert same.version == 1

    updated = upsert_anchors(
        run_id,
        [AnchorIn(hole=1, shot=1, clip_id="clip-1", t_start_ms=200, t_end_ms=600)],
    )[0]
    assert updated.version == 2
    assert updated.t_start_ms == 200


def test_list_anchors_sorted() -> None:
    run_id = "run-sorted"
    upsert_anchors(
        run_id,
        [
            AnchorIn(hole=2, shot=1, clip_id="clip-b", t_start_ms=50, t_end_ms=250),
            AnchorIn(hole=1, shot=2, clip_id="clip-a", t_start_ms=10, t_end_ms=120),
        ],
    )

    anchors = list_anchors(run_id)
    assert [(item.hole, item.shot) for item in anchors] == [(1, 2), (2, 1)]


def test_get_anchor_returns_none_when_missing() -> None:
    assert get_anchor("missing-run", 1, 1) is None
