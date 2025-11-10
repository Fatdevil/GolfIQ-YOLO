import importlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from server import jobs
from server.app import app
from server.repositories.clips_repo import InMemoryClipsRepository, clips_repo
from server.telemetry import events as telemetry_events

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch):
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
    assert response.status_code == status.HTTP_201_CREATED
    return response.json()["id"]


def _member_headers(
    member_id: str | None = None, role: str = "player"
) -> dict[str, str]:
    return {
        "x-event-role": role,
        "x-event-member": member_id or str(uuid.uuid4()),
    }


def test_presign_happy_path(monkeypatch, telemetry_sink):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")

    def _fake_presign(key, *_, **__):
        return "https://upload", {"key": key}

    monkeypatch.setattr(events_module, "presign_put", _fake_presign)

    response = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "abc123",
        },
        headers=_member_headers(),
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert uuid.UUID(body["clipId"])
    assert body["url"] == "https://upload"
    assert isinstance(body["fields"], dict)
    record = clips_repo.fetch(uuid.UUID(body["clipId"]))
    assert record is not None
    assert record.get("status") == "queued"
    assert any(event == "clips.upload.requested" for event, _ in telemetry_sink)


def test_presign_rejects_invalid_mime():
    event_id = _create_event()
    response = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/avi",
            "sizeBytes": 1024,
            "fingerprint": "oops",
        },
        headers=_member_headers(),
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_presign_rejects_large_payload(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
    response = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1_000_000_000,
            "fingerprint": "too-big",
        },
        headers=_member_headers(),
    )
    assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


def test_presign_returns_404_when_event_missing(monkeypatch):
    missing_event = str(uuid.uuid4())
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))

    response = client.post(
        f"/events/{missing_event}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "abc123",
        },
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_presign_requires_member_header(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
    response = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "abc123",
        },
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_complete_returns_404_for_missing_clip():
    response = client.post(
        "/clips/00000000-0000-0000-0000-000000000000/complete",
        json={"srcUri": "https://example.com/video.mp4"},
        headers=_member_headers(),
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_complete_rejects_invalid_clip_identifier():
    response = client.post(
        "/clips/not-a-uuid/complete",
        json={"srcUri": "https://example.com/video.mp4"},
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_complete_enqueues_transcode_job(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
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
    assert response.status_code == status.HTTP_200_OK
    jobs_buffer = jobs.get_buffered_jobs()
    assert jobs_buffer
    job_name, payload = jobs_buffer[-1]
    assert job_name == "transcode_clip"
    assert payload == {"clipId": clip_id, "src": "https://example.com/video.mp4"}
    record = clips_repo.fetch(uuid.UUID(clip_id))
    assert record.get("status") == "processing"


def test_complete_returns_404_when_repo_rejects(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
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
    monkeypatch.setattr(clips_repo, "mark_processing", lambda *_args, **_kwargs: False)
    response = client.post(
        f"/clips/{clip_id}/complete",
        json={"srcUri": "https://example.com/video.mp4"},
        headers=_member_headers(),
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_list_clips_respects_ready_status_and_limit(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
    headers = _member_headers()
    first = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "clip1",
        },
        headers=headers,
    )
    second = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "clip2",
        },
        headers=headers,
    )
    clips_repo.mark_ready(
        uuid.UUID(first.json()["clipId"]),
        hls_url="https://cdn/first.m3u8",
        mp4_url=None,
        thumb_url="https://cdn/first.jpg",
        duration_ms=10_000,
    )
    clips_repo.mark_processing(
        uuid.UUID(second.json()["clipId"]),
        src_uri="https://upload",
    )
    response = client.get(
        f"/events/{event_id}/clips",
        params={"limit": 1},
    )
    assert response.status_code == status.HTTP_200_OK
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["hlsUrl"] == "https://cdn/first.m3u8"

    after = datetime.now(timezone.utc) + timedelta(seconds=1)
    response_after = client.get(
        f"/events/{event_id}/clips",
        params={"after": after.isoformat()},
    )
    assert response_after.status_code == status.HTTP_200_OK
    assert response_after.json()["items"] == []


def test_list_clips_requires_existing_event():
    response = client.get(f"/events/{uuid.uuid4()}/clips", headers=_member_headers())
    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_react_requires_member_header(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
    presign = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "clip1",
        },
        headers=_member_headers(),
    )
    clip_id = presign.json()["clipId"]
    clips_repo.mark_ready(
        uuid.UUID(clip_id),
        hls_url="https://cdn/clip.m3u8",
        mp4_url=None,
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=12_000,
    )
    response = client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_react_rejects_invalid_clip_identifier():
    response = client.post(
        "/clips/not-a-uuid/react",
        json={"emoji": "🔥"},
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_react_success_emits_telemetry(monkeypatch, telemetry_sink):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
    headers = _member_headers(member_id="member-1")
    presign = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "clip1",
        },
        headers=headers,
    )
    clip_id = presign.json()["clipId"]
    clips_repo.mark_ready(
        uuid.UUID(clip_id),
        hls_url="https://cdn/clip.m3u8",
        mp4_url=None,
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=12_000,
    )
    response = client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK
    assert any(event == "clips.reaction" for event, _ in telemetry_sink)


def test_react_rate_limited(monkeypatch):
    event_id = _create_event()
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "presign_put", lambda *_, **__: ("u", {}))
    headers = _member_headers()
    presign = client.post(
        f"/events/{event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "fingerprint": "clip1",
        },
        headers=headers,
    )
    clip_id = presign.json()["clipId"]
    clips_repo.mark_ready(
        uuid.UUID(clip_id),
        hls_url="https://cdn/clip.m3u8",
        mp4_url=None,
        thumb_url="https://cdn/thumb.jpg",
        duration_ms=10_000,
    )
    first = client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
        headers=headers,
    )
    assert first.status_code == status.HTTP_200_OK
    second = client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
        headers=headers,
    )
    assert second.status_code == status.HTTP_429_TOO_MANY_REQUESTS
