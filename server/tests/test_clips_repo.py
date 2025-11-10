from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from server.repositories.clips_repo import (
    InMemoryClipsRepository,
    SupabaseClipsRepository,
)


class _FakeResponse:
    def __init__(self, *, status_code: int = 200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else []

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self):
        self.calls: dict[str, list[tuple[str, dict]]] = {
            "post": [],
            "patch": [],
            "get": [],
        }
        self._queues: dict[str, list[_FakeResponse]] = {
            "post": [],
            "patch": [],
            "get": [],
        }

    def queue(self, method: str, response: _FakeResponse) -> None:
        self._queues.setdefault(method, []).append(response)

    def _next(self, method: str) -> _FakeResponse:
        queue = self._queues.get(method) or []
        if queue:
            return queue.pop(0)
        return _FakeResponse()

    def post(self, path: str, **kwargs):
        self.calls["post"].append((path, kwargs))
        return self._next("post")

    def patch(self, path: str, **kwargs):
        self.calls["patch"].append((path, kwargs))
        return self._next("patch")

    def get(self, path: str, **kwargs):
        self.calls["get"].append((path, kwargs))
        return self._next("get")

    def close(self):
        return None


@pytest.fixture
def fake_client(monkeypatch: pytest.MonkeyPatch) -> _FakeClient:
    client = _FakeClient()
    module = importlib.import_module("server.repositories.clips_repo")
    monkeypatch.setattr(module.httpx, "Client", lambda *a, **k: client)
    return client


def test_create_placeholder_and_to_public(fake_client: _FakeClient):
    repo = SupabaseClipsRepository(
        base_url="https://supabase.test", service_key="svc-key", visibility="event"
    )
    clip_uuid = uuid.uuid4()
    fake_client.queue("post", _FakeResponse(payload=[{"id": str(clip_uuid)}]))

    event_id = uuid.uuid4()
    player_id = uuid.uuid4()
    created_id = repo.create_placeholder(
        event_id=event_id,
        player_id=player_id,
        hole=7,
        fingerprint="fingerprint-1",
    )

    assert created_id == clip_uuid
    assert fake_client.calls["post"]
    _, kwargs = fake_client.calls["post"][0]
    payload = kwargs["json"]
    assert payload["visibility"] == "event"
    assert payload["hole"] == 7
    assert payload["fingerprint"] == "fingerprint-1"

    record = {
        "id": clip_uuid,
        "event_id": str(event_id),
        "player_id": str(player_id),
        "status": "ready",
        "hls_url": "https://cdn/hls.m3u8",
        "mp4_url": "https://cdn/video.mp4",
        "thumb_url": "https://cdn/thumb.jpg",
        "duration_ms": 12_500,
        "fingerprint": "fingerprint-1",
        "visibility": "event",
        "created_at": "2024-01-01T00:00:00Z",
        "reactions": {"counts": {"🔥": 2}, "users": {}, "recent": []},
    }
    public = repo.to_public(record)
    assert public["id"] == str(clip_uuid)
    assert public["visibility"] == "event"
    assert public["fingerprint"] == "fingerprint-1"
    assert public["reactions"]["total"] == 2


def test_mark_processing_and_mark_ready_and_mark_failed(fake_client: _FakeClient):
    repo = SupabaseClipsRepository(
        base_url="https://supabase.test", service_key="svc-key", visibility="event"
    )
    clip_uuid = uuid.uuid4()
    fake_client.queue("patch", _FakeResponse(payload=[{"id": str(clip_uuid)}]))
    fake_client.queue("patch", _FakeResponse(status_code=404, payload=[]))
    fake_client.queue("patch", _FakeResponse(payload=[{"id": str(clip_uuid)}]))
    fake_client.queue("patch", _FakeResponse(status_code=200, payload=[]))
    fake_client.queue("patch", _FakeResponse(status_code=404, payload=[]))

    assert repo.mark_processing(clip_uuid, "https://cdn/input.mp4", actor="member-1")
    _, kwargs = fake_client.calls["patch"][0]
    assert kwargs["json"]["processed_by"] == "member-1"
    assert not repo.mark_processing(clip_uuid, "https://cdn/input.mp4")

    assert repo.mark_ready(
        clip_uuid,
        hls_url="https://cdn/master.m3u8",
        mp4_url="https://cdn/video.mp4",
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=10_000,
    )

    assert repo.mark_failed(clip_uuid, error="boom")
    assert not repo.mark_failed(clip_uuid)


def test_list_ready_with_after_and_limit():
    repo = InMemoryClipsRepository()
    event_id = uuid.uuid4()
    other_event = uuid.uuid4()

    ready_first = repo.create_placeholder(
        event_id=event_id, player_id=uuid.uuid4(), hole=3, fingerprint="fp-1"
    )
    ready_second = repo.create_placeholder(
        event_id=event_id, player_id=uuid.uuid4(), hole=5, fingerprint="fp-2"
    )
    repo.create_placeholder(
        event_id=other_event, player_id=uuid.uuid4(), hole=2, fingerprint="fp-other"
    )

    repo.mark_ready(
        ready_first,
        hls_url="https://cdn/first.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=9_000,
    )
    repo.mark_ready(
        ready_second,
        hls_url="https://cdn/second.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=12_000,
    )

    repo.fetch(ready_first)["created_at"] = "2024-01-01T00:00:00Z"
    repo.fetch(ready_second)["created_at"] = "2024-01-02T00:00:00Z"

    rows = repo.list_ready(event_id, limit=1)
    assert len(rows) == 1
    assert rows[0]["hls_url"] == "https://cdn/second.m3u8"

    cutoff = datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(hours=12)
    filtered = repo.list_ready(event_id, after=cutoff, limit=5)
    assert [row["hls_url"] for row in filtered] == ["https://cdn/second.m3u8"]


def test_add_reaction_true_and_rate_limited_false():
    repo = InMemoryClipsRepository()
    clip_uuid = repo.create_placeholder(
        event_id=uuid.uuid4(), player_id=uuid.uuid4(), hole=None, fingerprint="fp"
    )

    assert repo.add_reaction(clip_uuid, "member-1", "🔥")
    assert not repo.add_reaction(clip_uuid, "member-1", "🔥")

    record = repo.fetch(clip_uuid)
    assert record["reactions"]["counts"]["🔥"] == 1
    assert "member-1" in record["reactions"]["users"]
