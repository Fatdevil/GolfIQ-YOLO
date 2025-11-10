from __future__ import annotations

import importlib
import types
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pytest
from fastapi import Header, HTTPException, status
from fastapi.testclient import TestClient

from server.app import app


class _DummyClipsRepo:
    def __init__(self) -> None:
        self.placeholder_id = uuid.uuid4()
        self.create_calls: list[dict[str, object]] = []
        self.mark_processing_calls: list[dict[str, object]] = []
        self.list_ready_calls: list[dict[str, object]] = []
        self.add_reaction_calls: list[dict[str, object]] = []
        self.to_public_calls: list[dict[str, object]] = []
        self.list_ready_rows: list[dict[str, object]] = []
        self.mark_processing_result: bool = True
        self.add_reaction_result: bool = True

    def create_placeholder(
        self,
        *,
        event_id: uuid.UUID,
        player_id: uuid.UUID,
        hole: int | None,
        fingerprint: str,
        visibility: str | None = None,
    ) -> uuid.UUID:
        self.create_calls.append(
            {
                "event_id": event_id,
                "player_id": player_id,
                "hole": hole,
                "fingerprint": fingerprint,
                "visibility": visibility,
            }
        )
        return self.placeholder_id

    def mark_processing(
        self,
        clip_id: uuid.UUID,
        src_uri: str,
        *,
        actor: str | None = None,
    ) -> bool:
        self.mark_processing_calls.append(
            {"clip_id": clip_id, "src_uri": src_uri, "actor": actor}
        )
        return self.mark_processing_result

    def list_ready(
        self,
        event_id: uuid.UUID,
        *,
        after: datetime | None = None,
        limit: int = 20,
        visibility: str | None = None,
    ) -> list[dict[str, object]]:
        self.list_ready_calls.append(
            {
                "event_id": event_id,
                "after": after,
                "limit": limit,
                "visibility": visibility,
            }
        )
        return [dict(row) for row in self.list_ready_rows]

    def add_reaction(self, clip_id: uuid.UUID, member_id: str, emoji: str) -> bool:
        self.add_reaction_calls.append(
            {"clip_id": clip_id, "member_id": member_id, "emoji": emoji}
        )
        return self.add_reaction_result

    def to_public(self, record: dict[str, object]) -> dict[str, object]:
        self.to_public_calls.append(dict(record))
        return {
            "id": str(record.get("id")),
            "fingerprint": record.get("fingerprint"),
            "weight": record.get("weight", 0),
        }


@dataclass
class _RouteContext:
    client: TestClient
    event_id: str
    repo: _DummyClipsRepo
    enqueue_calls: list[tuple[str, dict[str, object]]]
    presign_calls: list[dict[str, object]]
    reaction_events: list[dict[str, object]]
    upload_events: list[dict[str, object]] = field(default_factory=list)


@pytest.fixture
def clips_routes(monkeypatch: pytest.MonkeyPatch) -> _RouteContext:
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)

    events_module = importlib.import_module("server.routes.events")
    repo_module = importlib.import_module("server.repositories.clips_repo")

    event_id = str(uuid.uuid4())

    class _FakeEventsRepo:
        def __init__(self) -> None:
            self.events = {event_id: {"id": event_id}}

        def get_event(self, candidate: str):
            return self.events.get(str(candidate))

    repo = _DummyClipsRepo()

    presign_calls: list[dict[str, object]] = []

    def _fake_presign(key: str, *, content_type: str, expires: int):
        presign_calls.append(
            {"key": key, "content_type": content_type, "expires": expires}
        )
        return "https://uploads.example", {"key": key, "Content-Type": content_type}

    enqueue_calls: list[tuple[str, dict[str, object]]] = []

    def _fake_enqueue(name: str, payload: dict[str, object]) -> None:
        enqueue_calls.append((name, dict(payload)))

    reaction_events: list[dict[str, object]] = []

    def _capture_reaction(**payload: object) -> None:
        reaction_events.append(dict(payload))

    upload_events: list[dict[str, object]] = []

    def _capture_upload(**payload: object) -> None:
        upload_events.append(dict(payload))

    def _fake_require_member(
        role: str | None = Header(default="player", alias="x-event-role"),
        member_id: str | None = Header(default=None, alias="x-event-member"),
    ):
        if not member_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="member id required"
            )
        return types.SimpleNamespace(id=member_id, role=role or "player")

    monkeypatch.setattr(events_module, "_REPOSITORY", _FakeEventsRepo())
    monkeypatch.setattr(events_module, "clips_repo", repo)
    monkeypatch.setattr(repo_module, "clips_repo", repo)
    monkeypatch.setattr(events_module, "presign_put", _fake_presign)
    monkeypatch.setattr(events_module.jobs, "enqueue", _fake_enqueue)
    monkeypatch.setattr(events_module, "emit_clip_reaction", _capture_reaction)
    monkeypatch.setattr(events_module, "emit_clip_upload_requested", _capture_upload)
    monkeypatch.setattr(events_module, "require_member", _fake_require_member)

    client = TestClient(app)
    return _RouteContext(
        client=client,
        event_id=event_id,
        repo=repo,
        enqueue_calls=enqueue_calls,
        presign_calls=presign_calls,
        reaction_events=reaction_events,
        upload_events=upload_events,
    )


def _member_headers(member_id: str = "member-1") -> dict[str, str]:
    return {"x-event-role": "player", "x-event-member": member_id}


def test_presign_returns_upload_details(clips_routes: _RouteContext) -> None:
    response = clips_routes.client.post(
        f"/events/{clips_routes.event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 2048,
            "hole": 5,
            "fingerprint": "fp-123",
        },
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["clipId"] == str(clips_routes.repo.placeholder_id)
    assert payload["url"] == "https://uploads.example"
    assert clips_routes.presign_calls[0]["content_type"] == "video/mp4"

    call = clips_routes.repo.create_calls[0]
    assert call["hole"] == 5
    assert call["fingerprint"] == "fp-123"
    assert clips_routes.upload_events and clips_routes.upload_events[0][
        "clipId"
    ] == str(clips_routes.repo.placeholder_id)


def test_presign_rejects_invalid_content_type(clips_routes: _RouteContext) -> None:
    response = clips_routes.client.post(
        f"/events/{clips_routes.event_id}/clips/presign",
        json={
            "contentType": "video/avi",
            "sizeBytes": 512,
            "fingerprint": "fp-123",
        },
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_presign_rejects_invalid_size(clips_routes: _RouteContext) -> None:
    response = clips_routes.client.post(
        f"/events/{clips_routes.event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 0,
            "fingerprint": "fp-123",
        },
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_presign_rejects_invalid_payload(clips_routes: _RouteContext) -> None:
    response = clips_routes.client.post(
        f"/events/{clips_routes.event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 1024,
            "hole": 19,
            "fingerprint": "fp-123",
        },
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_presign_requires_member_headers(clips_routes: _RouteContext) -> None:
    response = clips_routes.client.post(
        f"/events/{clips_routes.event_id}/clips/presign",
        json={
            "contentType": "video/mp4",
            "sizeBytes": 2048,
            "fingerprint": "fp-123",
        },
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_complete_enqueues_transcode_job(clips_routes: _RouteContext) -> None:
    clip_id = str(clips_routes.repo.placeholder_id)
    response = clips_routes.client.post(
        f"/clips/{clip_id}/complete",
        json={"srcUri": "https://uploads/source.mp4"},
        headers=_member_headers("member-7"),
    )

    assert response.status_code == status.HTTP_200_OK
    call = clips_routes.repo.mark_processing_calls[0]
    assert call["clip_id"] == uuid.UUID(clip_id)
    assert call["actor"] == "member-7"
    assert clips_routes.enqueue_calls == [
        (
            "transcode_clip",
            {"clipId": clip_id, "src": "https://uploads/source.mp4"},
        )
    ]


def test_complete_returns_not_found_when_repo_rejects(
    clips_routes: _RouteContext,
) -> None:
    clips_routes.repo.mark_processing_result = False
    clip_id = str(clips_routes.repo.placeholder_id)

    response = clips_routes.client.post(
        f"/clips/{clip_id}/complete",
        json={"srcUri": "https://uploads/source.mp4"},
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not clips_routes.enqueue_calls


def test_list_clips_returns_public_rows(clips_routes: _RouteContext) -> None:
    first = uuid.uuid4()
    second = uuid.uuid4()
    clips_routes.repo.list_ready_rows = [
        {"id": second, "fingerprint": "fp-2", "weight": 2},
        {"id": first, "fingerprint": "fp-1", "weight": 1},
    ]

    response = clips_routes.client.get(f"/events/{clips_routes.event_id}/clips")

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["items"][0]["id"] == str(second)
    assert clips_routes.repo.list_ready_calls[0]["limit"] == 20


def test_list_clips_filters_after_and_clamps_low_limit(
    clips_routes: _RouteContext,
) -> None:
    clips_routes.repo.list_ready_rows = []
    after = datetime.now(timezone.utc)

    response = clips_routes.client.get(
        f"/events/{clips_routes.event_id}/clips",
        params={"after": after.isoformat(), "limit": -5},
    )

    assert response.status_code == status.HTTP_200_OK
    call = clips_routes.repo.list_ready_calls[0]
    assert call["after"] == after
    assert call["limit"] == 1


def test_list_clips_clamps_high_limit(clips_routes: _RouteContext) -> None:
    clips_routes.repo.list_ready_rows = []

    response = clips_routes.client.get(
        f"/events/{clips_routes.event_id}/clips",
        params={"limit": 500},
    )

    assert response.status_code == status.HTTP_200_OK
    call = clips_routes.repo.list_ready_calls[0]
    assert call["limit"] == 100


def test_list_clips_rejects_invalid_after(clips_routes: _RouteContext) -> None:
    response = clips_routes.client.get(
        f"/events/{clips_routes.event_id}/clips",
        params={"after": "not-a-date"},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_react_accepts_and_emits(clips_routes: _RouteContext) -> None:
    clip_id = str(clips_routes.repo.placeholder_id)
    response = clips_routes.client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
        headers=_member_headers("member-3"),
    )

    assert response.status_code == status.HTTP_200_OK
    call = clips_routes.repo.add_reaction_calls[0]
    assert call["clip_id"] == uuid.UUID(clip_id)
    assert call["member_id"] == "member-3"
    assert clips_routes.reaction_events == [
        {"clipId": clip_id, "userId": "member-3", "emoji": "🔥"}
    ]


def test_react_returns_rate_limited(clips_routes: _RouteContext) -> None:
    clips_routes.repo.add_reaction_result = False
    clip_id = str(clips_routes.repo.placeholder_id)

    response = clips_routes.client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


def test_react_requires_member_headers(clips_routes: _RouteContext) -> None:
    clip_id = str(clips_routes.repo.placeholder_id)
    response = clips_routes.client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "🔥"},
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_react_rejects_invalid_emoji(clips_routes: _RouteContext) -> None:
    clip_id = str(clips_routes.repo.placeholder_id)
    response = clips_routes.client.post(
        f"/clips/{clip_id}/react",
        json={"emoji": "this-is-too-long"},
        headers=_member_headers(),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
