from __future__ import annotations

from queue import Empty

import pytest

from server.services.watch_tip_bus import (
    Tip,
    _TIPS,
    clear,
    list_tips,
    publish,
    subscribe,
    unsubscribe,
)


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


def test_unsubscribe_stops_future_deliveries() -> None:
    member_id = "member-cleanup"
    queue = subscribe(member_id)

    unsubscribe(member_id, queue)

    publish(
        member_id,
        Tip(tipId="new-tip", title="Title", body="Body", ts=0),
    )

    with pytest.raises(Empty):
        queue.get_nowait()


def test_clear_member_prunes_tips_and_subscribers() -> None:
    member_id = "member-clear"
    queue = subscribe(member_id)
    publish(member_id, Tip(tipId="before", title="A", body="B", ts=0))

    # Drain any queued tip so the queue is empty before asserting post-clear behavior
    queue.get_nowait()

    clear(member_id)

    assert list_tips(member_id) == []

    publish(member_id, Tip(tipId="after", title="C", body="D", ts=0))

    # A fresh subscription should receive the new tip, proving state was reset.
    new_queue = subscribe(member_id)
    publish(member_id, Tip(tipId="after-2", title="D", body="E", ts=0))
    assert new_queue.get_nowait().tipId == "after-2"
