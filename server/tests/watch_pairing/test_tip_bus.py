from __future__ import annotations

from queue import Empty

import pytest

from server.services.watch_tip_bus import Tip, _TIPS, clear, publish, subscribe


@pytest.fixture(autouse=True)
def reset_tip_bus() -> None:
    clear()
    yield
    clear()


def test_publish_is_idempotent_per_member_and_tipid() -> None:
    """Publishing the same tip twice should retain the original entry."""

    member_id = "member-id-1"
    queue = subscribe(member_id)

    first_tip = publish(
        member_id,
        Tip(
            tipId="t-1",
            title="First",
            body="Hi",
            club=None,
            playsLike_m=None,
            shotRef=None,
            ts=123,
        ),
    )

    second_tip = publish(
        member_id,
        Tip(
            tipId="t-1",
            title="First",
            body="Hi",
            club=None,
            playsLike_m=None,
            shotRef=None,
            ts=999,
        ),
    )

    assert first_tip is second_tip
    assert second_tip.ts == 123

    assert member_id in _TIPS
    assert list(_TIPS[member_id].keys()) == ["t-1"]

    queued = queue.get_nowait()
    assert queued.tipId == "t-1"

    try:
        duplicate = queue.get_nowait()
    except Empty:
        duplicate = None
    if duplicate is not None:
        assert duplicate.tipId == "t-1"
        assert duplicate.ts == 123
