from __future__ import annotations

import importlib
import json
import types
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from server.repositories.clips_repo import (
    InMemoryClipsRepository,
    SupabaseClipsRepository,
)

clips_module = importlib.import_module("server.repositories.clips_repo")


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


def test_inmemory_add_reaction_requires_existing_clip():
    repo = InMemoryClipsRepository()
    assert not repo.add_reaction(uuid.uuid4(), "member-1", "🔥")


def test_inmemory_mark_ready_and_failed_paths():
    repo = InMemoryClipsRepository()
    clip_uuid = repo.create_placeholder(
        event_id=uuid.uuid4(),
        player_id=uuid.uuid4(),
        hole=3,
        fingerprint="fp-ready",
    )

    assert repo.mark_ready(
        clip_uuid,
        hls_url="https://cdn/clip.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=9000,
    )
    assert repo.mark_failed(clip_uuid, error="boom")
    record = repo.fetch(clip_uuid)
    assert record.get("error") == "boom"

    missing = uuid.uuid4()
    assert repo.mark_processing(clip_uuid, "https://src", actor="member")
    assert record.get("processed_by") == "member"
    assert repo.mark_failed(clip_uuid)
    assert not repo.mark_ready(
        missing,
        hls_url="https://cdn/other.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=None,
    )
    assert not repo.mark_failed(missing)

    other_clip = repo.create_placeholder(
        event_id=uuid.uuid4(),
        player_id=uuid.uuid4(),
        hole=2,
        fingerprint="fp-processing",
    )
    assert repo.mark_processing(other_clip, "https://src-no-actor")
    assert "processed_by" not in repo.fetch(other_clip)


def test_to_public_defaults_visibility_and_handles_missing_record():
    repo = InMemoryClipsRepository()
    clip_uuid = repo.create_placeholder(
        event_id=uuid.uuid4(),
        player_id=uuid.uuid4(),
        hole=4,
        fingerprint="fp-default",
    )
    record = repo.fetch(clip_uuid)
    record.pop("visibility", None)
    record["created_at"] = "2024-03-01T12:00:00Z"

    public = repo.to_public(record)

    assert public["visibility"] == "event"
    assert public["reactions"]["total"] == 0

    missing = repo.fetch(uuid.uuid4())
    assert missing is None


def test_helper_functions_cover_reaction_state_and_counts():
    now = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
    raw_payload = json.dumps(
        {
            "counts": {"🔥": 1.0},
            "users": {"member-1": {"emoji": "🔥", "ts": "2024-01-01T11:59:00Z"}},
            "recent": [{"emoji": "🔥", "ts": "2024-01-01T11:59:30Z"}],
        }
    )
    state = clips_module._reaction_state(raw_payload)
    allowed, new_state, recent_count = clips_module._register_reaction(
        state, "member-2", "  👏  ", now=now
    )
    assert allowed and recent_count == len(new_state.recent)

    denied, _, _ = clips_module._register_reaction(new_state, "member-2", "👏", now=now)
    assert not denied
    empty_allowed, _, _ = clips_module._register_reaction(
        state, "member-3", "   ", now=now
    )
    assert not empty_allowed

    invalid_state = clips_module._reaction_state("not-json")
    assert isinstance(invalid_state, clips_module._ReactionState)

    rate_limited_state = clips_module._ReactionState(
        counts={"🔥": 1},
        users={"member-1": {"emoji": "🔥", "ts": clips_module._serialize_ts(now)}},
        recent=[{"emoji": "🔥", "ts": clips_module._serialize_ts(now)}],
    )
    limited, _, _ = clips_module._register_reaction(
        rate_limited_state, "member-1", "🔥", now=now + timedelta(seconds=1)
    )
    assert not limited

    aged_state = clips_module._ReactionState(
        counts=rate_limited_state.counts,
        users={
            "member-1": {
                "emoji": "🔥",
                "ts": clips_module._serialize_ts(
                    now - timedelta(seconds=clips_module.RATE_LIMIT_SECONDS + 5)
                ),
            }
        },
        recent=list(rate_limited_state.recent),
    )
    allowed_again, _, recent_again = clips_module._register_reaction(
        aged_state, "member-1", "🔥", now=now
    )
    assert allowed_again and recent_again >= 1

    messy_state = clips_module._reaction_state(
        {
            "counts": {"🔥": "2", "oops": "x"},
            "users": {"member-4": {"emoji": "💥", "ts": "2024-01-01T11:58:00Z"}},
            "recent": [123, {"emoji": "💥", "ts": None}],
        }
    )
    assert "oops" not in messy_state.counts
    assert messy_state.users["member-4"]["emoji"] == "💥"

    _, trimmed_state, _ = clips_module._register_reaction(
        messy_state, "member-5", "💥", now=now
    )
    null_recent_state = clips_module._ReactionState(
        counts=trimmed_state.counts,
        users=trimmed_state.users,
        recent=[{"emoji": "💥", "ts": None}],
    )
    assert clips_module._recent_count(null_recent_state, now) == 0

    assert clips_module._total_count(new_state) >= 2
    assert clips_module._recent_count(new_state, now) == len(new_state.recent)
    weight = clips_module._compute_weight(
        recent=recent_count,
        total=clips_module._total_count(new_state),
        created_at=now - timedelta(minutes=5),
        now=now,
    )
    assert weight > 0

    weight_no_created = clips_module._compute_weight(
        recent=0, total=0, created_at=None, now=now
    )
    assert weight_no_created == 0

    invalid_counts_state = clips_module._reaction_state({"counts": ["invalid"]})
    assert invalid_counts_state.counts == {}

    stale_state = clips_module._ReactionState(
        counts={},
        users={},
        recent=[{"emoji": "🔥", "ts": "2000-01-01T00:00:00Z"}],
    )
    allowed_stale, trimmed_stale, recent_stale = clips_module._register_reaction(
        stale_state, "member-6", "🔥", now=now
    )
    assert allowed_stale
    assert recent_stale == 1
    assert len(trimmed_stale.recent) == 1

    old_state = clips_module._ReactionState(
        counts=new_state.counts,
        users=new_state.users,
        recent=[{"emoji": "🔥", "ts": "1999-12-31T23:59:00Z"}],
    )
    assert clips_module._recent_count(old_state, now) == 0


def test_helper_parsing_and_sorting_behaviour():
    naive = datetime(2024, 1, 1, 8, 30)
    parsed = clips_module._parse_dt(naive)
    assert parsed.tzinfo is not None

    iso = "2024-01-01T08:30:00Z"
    assert clips_module._parse_dt(iso).tzinfo is not None
    assert clips_module._parse_dt("invalid") is None

    aware = datetime(2024, 1, 1, 8, 30, tzinfo=timezone.utc)
    assert clips_module._parse_dt(aware) == aware

    as_str = clips_module._serialize_ts(parsed)
    assert as_str.endswith("Z")

    ensured = clips_module._ensure_uuid(str(uuid.uuid4()))
    assert isinstance(ensured, uuid.UUID)

    identity_uuid = uuid.uuid4()
    assert clips_module._ensure_uuid(identity_uuid) is identity_uuid

    key_recent = clips_module._sort_key({"created_at": "2024-01-02T00:00:00Z"})
    key_default = clips_module._sort_key({})
    assert key_recent > key_default


def test_supabase_edge_paths(fake_client: _FakeClient):
    repo = SupabaseClipsRepository(
        base_url="https://supabase.test", service_key="svc-key", visibility="event"
    )

    fake_client.queue("post", _FakeResponse(payload=[]))
    with pytest.raises(RuntimeError):
        repo.create_placeholder(
            event_id=uuid.uuid4(),
            player_id=uuid.uuid4(),
            hole=None,
            fingerprint="fp",
        )

    fake_client.queue("get", _FakeResponse(payload={}))
    rows = repo.list_ready(uuid.uuid4(), limit=5)
    assert rows == []

    fake_client.queue("get", _FakeResponse(payload=[]))
    assert repo.fetch(uuid.uuid4()) is None

    cutoff = datetime(2024, 1, 2, tzinfo=timezone.utc)
    fake_client.queue("get", _FakeResponse(payload=[]))
    repo.list_ready(uuid.uuid4(), after=cutoff, visibility="event", limit=2)
    _, kwargs = fake_client.calls["get"][-1]
    params = kwargs.get("params", {})
    assert params["created_at"].startswith("gt.")
    assert params["visibility"] == "eq.event"

    clip_uuid = uuid.uuid4()
    fake_client.queue(
        "get",
        _FakeResponse(
            payload=[{"id": str(clip_uuid), "created_at": "2024-01-01T00:00:00Z"}]
        ),
    )
    record = repo.fetch(clip_uuid)
    assert record["id"] == str(clip_uuid)

    repo.close()


def test_supabase_add_reaction_false_paths(monkeypatch: pytest.MonkeyPatch):
    repo = SupabaseClipsRepository(
        base_url="https://supabase.test", service_key="svc-key", visibility="event"
    )

    monkeypatch.setattr(repo, "fetch", lambda *_: None)
    assert not repo.add_reaction(uuid.uuid4(), "member-1", "🔥")

    payload = {
        "reactions": {
            "counts": {},
            "users": {
                "member-1": {
                    "emoji": "🔥",
                    "ts": clips_module._serialize_ts(datetime.now(timezone.utc)),
                }
            },
            "recent": [],
        }
    }

    def _fake_fetch(*_args, **_kwargs):
        return payload

    monkeypatch.setattr(repo, "fetch", _fake_fetch)
    monkeypatch.setattr(
        repo,
        "_client",
        types.SimpleNamespace(
            patch=lambda *a, **k: _FakeResponse(payload=[{"id": "clip"}])
        ),
    )

    monkeypatch.setattr(
        clips_module,
        "_register_reaction",
        lambda state, member_id, emoji, now: (False, state, 0),
    )
    assert not repo.add_reaction(uuid.uuid4(), "member-1", "🔥")


def test_supabase_add_reaction_success(monkeypatch: pytest.MonkeyPatch):
    repo = SupabaseClipsRepository(
        base_url="https://supabase.test", service_key="svc-key", visibility="event"
    )

    payload = {
        "reactions": {"counts": {}, "users": {}, "recent": []},
    }

    monkeypatch.setattr(repo, "fetch", lambda *_: payload)

    captured: dict[str, object] = {}

    def _fake_patch(*args, **kwargs):
        captured["called"] = True
        return _FakeResponse(payload=[{"id": "clip"}])

    monkeypatch.setattr(repo, "_client", types.SimpleNamespace(patch=_fake_patch))
    monkeypatch.setattr(
        clips_module,
        "_register_reaction",
        lambda state, member_id, emoji, now: (True, state, 1),
    )

    assert repo.add_reaction(uuid.uuid4(), "member-1", "🔥")
    assert captured.get("called")


def test_supabase_base_url_suffix(fake_client: _FakeClient) -> None:
    repo = SupabaseClipsRepository(
        base_url="https://supabase.test/rest/v1",
        service_key="svc-key",
        visibility="event",
    )
    assert repo._base_url.endswith("/rest/v1")
    repo.close()


def test_supabase_from_env_requires_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    with pytest.raises(RuntimeError):
        SupabaseClipsRepository.from_env()


def test_supabase_from_env_success(
    monkeypatch: pytest.MonkeyPatch, fake_client: _FakeClient
) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://supabase.test")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc-key")

    repo = SupabaseClipsRepository.from_env()
    try:
        assert isinstance(repo, SupabaseClipsRepository)
        assert repo._base_url.endswith("/rest/v1")
        assert repo._visibility == clips_module.DEFAULT_VISIBILITY
    finally:
        repo.close()


def test_supabase_mark_ready_handles_not_found(fake_client: _FakeClient):
    repo = SupabaseClipsRepository(
        base_url="https://supabase.test", service_key="svc-key", visibility="event"
    )

    fake_client.queue("patch", _FakeResponse(status_code=404, payload=[]))
    result = repo.mark_ready(
        uuid.uuid4(),
        hls_url="https://cdn/hls.m3u8",
        mp4_url=None,
        thumb_url=None,
        duration_ms=None,
    )

    assert not result


def test_clips_repo_facade_reset(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinels = [object(), object()]

    def _fake_build(self):
        return sentinels.pop(0)

    monkeypatch.setattr(clips_module._ClipsRepoFacade, "_build_default", _fake_build)
    facade = clips_module._ClipsRepoFacade()
    first_repo = facade._repo

    facade.reset()
    assert facade._repo is not first_repo
