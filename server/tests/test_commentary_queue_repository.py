import pytest

from server.schemas.commentary import CommentaryStatus
from server.services import commentary_queue


@pytest.fixture(autouse=True)
def reset_repo():
    commentary_queue.reset()
    yield
    commentary_queue.reset()


def test_ensure_record_requires_event_id():
    with pytest.raises(ValueError):
        commentary_queue.upsert("clip-1", status=CommentaryStatus.queued)


def test_upsert_reassigns_event_bucket():
    first = commentary_queue.upsert(
        "clip-1",
        event_id="event-a",
        status=CommentaryStatus.queued,
    )
    assert commentary_queue.resolve_event_id(first.clipId) == "event-a"

    second = commentary_queue.upsert(
        first.clipId,
        event_id="event-b",
        status=CommentaryStatus.running,
    )
    assert second.status is CommentaryStatus.running
    assert commentary_queue.resolve_event_id(first.clipId) == "event-b"
    assert "clip-1" not in commentary_queue._EVENT_INDEX.get("event-a", set())
    assert "clip-1" in commentary_queue._EVENT_INDEX.get("event-b", set())


def test_get_missing_raises_key_error():
    with pytest.raises(KeyError):
        commentary_queue.get("missing")


def test_list_for_event_handles_empty_and_missing_records():
    assert commentary_queue.list_for_event("evt-empty") == []

    commentary_queue.upsert(
        "clip-1",
        event_id="evt-1",
        status=CommentaryStatus.ready,
    )
    commentary_queue._STORE.pop("clip-1")  # type: ignore[attr-defined]
    items = commentary_queue.list_for_event("evt-1")
    assert items == []


def test_resolve_event_id_missing():
    assert commentary_queue.resolve_event_id("clip-1") is None
