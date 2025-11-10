import uuid
from datetime import datetime, timedelta, timezone

import pytest

from server.repositories.clips_repo import InMemoryClipsRepository


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def test_create_placeholder_sets_defaults():
    repo = InMemoryClipsRepository()
    clip_id = repo.create_placeholder(
        event_id=_uuid(),
        player_id=_uuid(),
        hole=3,
        fingerprint="fp-1",
    )
    record = repo.fetch(clip_id)
    assert record["status"] == "queued"
    assert record["visibility"] == "event"
    assert record["reactions"]["counts"] == {}
    assert "created_at" in record


def test_mark_processing_ready_and_failed():
    repo = InMemoryClipsRepository()
    clip_id = repo.create_placeholder(
        event_id=_uuid(),
        player_id=_uuid(),
        hole=None,
        fingerprint="fp-2",
    )
    assert repo.mark_processing(clip_id, "https://cdn/src.mp4", actor="member-1")
    record = repo.fetch(clip_id)
    assert record["status"] == "processing"
    assert record["processed_by"] == "member-1"

    assert repo.mark_ready(
        clip_id,
        hls_url="https://cdn/master.m3u8",
        mp4_url="https://cdn/src.mp4",
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=12_000,
    )
    record = repo.fetch(clip_id)
    assert record["status"] == "ready"
    assert record["duration_ms"] == 12_000
    assert repo.mark_failed(clip_id, error="boom")
    record = repo.fetch(clip_id)
    assert record["status"] == "failed"
    assert record["error"] == "boom"


def test_mark_methods_return_false_for_missing_clip():
    repo = InMemoryClipsRepository()
    missing = _uuid()
    assert not repo.mark_processing(missing, "https://cdn", actor="actor")
    assert not repo.mark_ready(
        missing,
        hls_url="https://cdn/master.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=None,
    )
    assert not repo.mark_failed(missing, error="nope")


def test_list_ready_filters_and_limits():
    repo = InMemoryClipsRepository()
    event_id = _uuid()
    first = repo.create_placeholder(
        event_id=event_id,
        player_id=_uuid(),
        hole=None,
        fingerprint="fp-3",
    )
    second = repo.create_placeholder(
        event_id=event_id,
        player_id=_uuid(),
        hole=None,
        fingerprint="fp-4",
    )
    repo.mark_ready(
        first,
        hls_url="https://cdn/first.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=10_000,
    )
    repo.mark_ready(
        second,
        hls_url="https://cdn/second.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=15_000,
    )
    # make first older than second
    repo.fetch(first)["created_at"] = "2024-01-01T00:00:00Z"
    repo.fetch(second)["created_at"] = "2024-01-02T00:00:00Z"

    rows = repo.list_ready(event_id, limit=1)
    assert len(rows) == 1
    assert rows[0]["hls_url"] == "https://cdn/second.m3u8"

    cutoff = datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(hours=12)
    after_rows = repo.list_ready(event_id, after=cutoff)
    assert len(after_rows) == 1
    assert after_rows[0]["hls_url"] == "https://cdn/second.m3u8"


def test_add_reaction_and_rate_limit():
    repo = InMemoryClipsRepository()
    clip_id = repo.create_placeholder(
        event_id=_uuid(),
        player_id=_uuid(),
        hole=None,
        fingerprint="fp-5",
    )
    assert repo.add_reaction(clip_id, "member-1", "🔥")
    # immediate repeat should be rate limited
    assert not repo.add_reaction(clip_id, "member-1", "🔥")

    record = repo.fetch(clip_id)
    counts = record["reactions"]["counts"]
    assert counts["🔥"] == 1


def test_to_public_shape():
    repo = InMemoryClipsRepository()
    clip_id = repo.create_placeholder(
        event_id=_uuid(),
        player_id=_uuid(),
        hole=9,
        fingerprint="fp-6",
    )
    repo.mark_ready(
        clip_id,
        hls_url="https://cdn/ready.m3u8",
        mp4_url="https://cdn/ready.mp4",
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=9000,
    )
    public = repo.to_public(repo.fetch(clip_id))
    assert public["id"] == str(clip_id)
    assert public["hlsUrl"] == "https://cdn/ready.m3u8"
    assert public["reactions"]["total"] >= 0
    assert "weight" in public


@pytest.mark.parametrize("hole", [None, 1, 18])
def test_create_placeholder_allows_valid_hole(hole):
    repo = InMemoryClipsRepository()
    clip_id = repo.create_placeholder(
        event_id=_uuid(),
        player_id=_uuid(),
        hole=hole,
        fingerprint="fp-hole",
    )
    record = repo.fetch(clip_id)
    assert record["hole"] == hole
