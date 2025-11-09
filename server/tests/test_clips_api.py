from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server import jobs
from server.repositories.clips_repo import InMemoryClipsRepository, clips_repo
from server.telemetry import events as telemetry_events

client = TestClient(app)


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(
        events_module, "_REPOSITORY", events_module._MemoryEventsRepository()
    )
    repo = InMemoryClipsRepository()
    clips_repo.set_repository(repo)
    jobs.clear_buffer()
    yield repo
    clips_repo.set_repository(InMemoryClipsRepository())
    jobs.clear_buffer()


@pytest.fixture
def telemetry_sink():
    captured: list[tuple[str, dict]] = []

    def _emit(name: str, payload):
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    yield captured
    telemetry_events.set_events_telemetry_emitter(None)


def _create_event() -> str:
    response = client.post("/events", json={"name": "Club Night"})
    assert response.status_code == 201
    return response.json()["id"]


def _member_headers(
    member_id: str | None = None, role: str = "player"
) -> dict[str, str]:
    return {
        "x-event-role": role,
        "x-event-member": member_id or str(uuid.uuid4()),
    }


def test_presign_creates_placeholder(monkeypatch, telemetry_sink):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(
        events_module,
        "presign_put",
        lambda key, content_type, expires: ("https://upload", {"key": key}),
    )

    response = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "abc123",
        },
        headers=_member_headers(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["clipId"]
    assert body["url"] == "https://upload"
    assert "fields" in body
    repo_state = clips_repo.fetch(uuid.UUID(body["clipId"]))
    assert repo_state is not None
    assert repo_state.get("status") == "queued"
    assert any(event == "clips.upload.requested" for event, _ in telemetry_sink)


def test_presign_rejects_large_payload(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *args, **kwargs: ("u", {}))
    response = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 100_000_000,
            "fingerprint": "too-big",
        },
        headers=_member_headers(),
    )
    assert response.status_code == 413


def test_complete_enqueues_transcode(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *args, **kwargs: ("u", {}))
    presign = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "abc123",
        },
        headers=_member_headers(),
    )
    clip_id = presign.json()["clipId"]
    response = client.post(
        f"/clips/{clip_id}/complete",
        json={"srcUri": "https://example.com/video.mp4"},
        headers=_member_headers(),
    )
    assert response.status_code == 200
    job_entries = jobs.get_buffered_jobs()
    assert job_entries
    name, payload = job_entries[-1]
    assert name == "transcode_clip"
    assert payload["clipId"] == clip_id
    record = clips_repo.fetch(uuid.UUID(clip_id))
    assert record.get("status") == "processing"


def test_list_clips_filters_and_orders(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *args, **kwargs: ("u", {}))
    headers = _member_headers()
    presign = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "abc123",
        },
        headers=headers,
    )
    clip_id = uuid.UUID(presign.json()["clipId"])
    clips_repo.mark_ready(
        clip_id,
        hls_url="https://cdn/clips/master.m3u8",
        mp4_url=None,
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=15_000,
    )
    after = datetime.now(timezone.utc) - timedelta(days=1)
    response = client.get(
        f"/events/{event_id}/clips",
        params={"after": after.isoformat(), "limit": 10},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["hlsUrl"].endswith("master.m3u8")
    assert items[0]["weight"] > 0


def test_react_rate_limited(monkeypatch, telemetry_sink):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *args, **kwargs: ("u", {}))
    headers = _member_headers()
    presign = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "abc123",
        },
        headers=headers,
    )
    clip_id = presign.json()["clipId"]
    clips_repo.mark_ready(
        uuid.UUID(clip_id),
        hls_url="https://cdn/clips/master.m3u8",
        mp4_url=None,
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=10_000,
    )
    first = client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
        headers=headers,
    )
    assert first.status_code == 200
    second = client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
        headers=headers,
    )
    assert second.status_code == 429
    assert any(event == "clips.reaction" for event, _ in telemetry_sink)


def test_worker_mark_ready(monkeypatch, telemetry_sink):
    from server.jobs import transcode_clip

    repo = InMemoryClipsRepository()
    clips_repo.set_repository(repo)
    clip_id = repo.create_placeholder(
        event_id=uuid.uuid4(),
        player_id=uuid.uuid4(),
        hole=None,
        fingerprint="fp",
    )
    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "stub")
    monkeypatch.setattr(
        transcode_clip,
        "_stub_transcode",
        lambda clip_uuid, src: {
            "hls_url": "https://cdn/master.m3u8",
            "thumb_url": "https://cdn/thumb.jpg",
            "mp4_url": src,
            "duration_ms": 1234,
        },
    )
    transcode_clip.handle(
        {"clipId": str(clip_id), "src": "https://example.com/video.mp4"}
    )
    record = repo.fetch(clip_id)
    assert record.get("status") == "ready"
    assert record.get("hls_url") == "https://cdn/master.m3u8"
    assert any(event == "clips.ready" for event, _ in telemetry_sink)


def test_worker_failure_marks_failed(monkeypatch, telemetry_sink):
    from server.jobs import transcode_clip

    repo = InMemoryClipsRepository()
    clips_repo.set_repository(repo)
    clip_id = repo.create_placeholder(
        event_id=uuid.uuid4(),
        player_id=uuid.uuid4(),
        hole=None,
        fingerprint="fp",
    )
    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "stub")

    def _raise(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(transcode_clip, "_stub_transcode", _raise)
    with pytest.raises(RuntimeError):
        transcode_clip.handle(
            {"clipId": str(clip_id), "src": "https://example.com/video.mp4"}
        )
    record = repo.fetch(clip_id)
    assert record.get("status") == "failed"
    assert any(event == "clips.failed" for event, _ in telemetry_sink)
