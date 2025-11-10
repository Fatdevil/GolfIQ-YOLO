import importlib
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.schemas.commentary import CommentaryStatus
from server.services import clips_repo, commentary, commentary_queue

client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-2"}


@pytest.fixture(autouse=True)
def reset_queue(monkeypatch: pytest.MonkeyPatch):
    commentary_queue.reset()
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    yield
    commentary_queue.reset()


@pytest.fixture
def setup_event(monkeypatch: pytest.MonkeyPatch):
    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})

    event = repo.create_event("AI Showcase", None, code="AI0001")
    clip_id = str(uuid4())
    clips_repo.register_clip(
        {"id": clip_id, "event_id": event["id"], "player_name": "Linn"}
    )
    return events_module, clip_id, event["id"]


def test_post_commentary_sets_queued_status(
    setup_event, monkeypatch: pytest.MonkeyPatch
) -> None:
    _events_module, clip_id, event_id = setup_event

    def fake_generate(target_clip: str):
        record = commentary_queue.get(target_clip)
        assert record.status == CommentaryStatus.queued
        commentary_queue.upsert(
            target_clip,
            event_id=event_id,
            status=CommentaryStatus.ready,
            title="Final highlight",
            summary="Drains the long birdie putt",
            tts_url=None,
        )
        return commentary.CommentaryResult(
            clip_id=target_clip,
            title="Final highlight",
            summary="Drains the long birdie putt",
            tts_url=None,
        )

    monkeypatch.setattr(commentary, "generate_commentary", fake_generate)

    response = client.post(f"/events/clips/{clip_id}/commentary", headers=ADMIN_HEADERS)
    assert response.status_code == 200

    stored = commentary_queue.get(clip_id)
    assert stored.status == CommentaryStatus.ready
    assert stored.title == "Final highlight"
    assert stored.summary == "Drains the long birdie putt"


def test_post_commentary_safe_sets_blocked(
    setup_event, monkeypatch: pytest.MonkeyPatch
) -> None:
    events_module, clip_id, event_id = setup_event

    monkeypatch.setattr(
        events_module,
        "_resolve_commentary_safe_flag",
        lambda _event: True,
    )
    monkeypatch.setattr(
        commentary,
        "generate_commentary",
        lambda _clip: pytest.fail("should not request commentary when safe"),
    )

    response = client.post(f"/events/clips/{clip_id}/commentary", headers=ADMIN_HEADERS)
    assert response.status_code == 423

    stored = commentary_queue.get(clip_id)
    assert stored.status == CommentaryStatus.blocked_safe
    assert stored.title is None
    assert stored.summary is None
