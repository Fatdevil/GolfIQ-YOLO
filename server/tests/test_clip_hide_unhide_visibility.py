from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.routes.moderation import reset_rate_limiter
from server.services import clips_repo, moderation_repo

client = TestClient(app, raise_server_exceptions=False)

ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-1"}
SPECTATOR_HEADERS = {"x-event-role": "spectator", "x-event-member": "member-9"}
SPECTATOR_NO_MEMBER = {"x-event-role": "spectator"}


@pytest.fixture(autouse=True)
def reset_state() -> None:
    clips_repo._CLIP_STORE.clear()  # type: ignore[attr-defined]
    moderation_repo.reset()
    reset_rate_limiter()
    yield
    clips_repo._CLIP_STORE.clear()  # type: ignore[attr-defined]
    moderation_repo.reset()
    reset_rate_limiter()


def _register_clip() -> None:
    clips_repo.register_clip(
        {
            "id": "clip-100",
            "event_id": "event-55",
            "player_name": "Alex Golfer",
            "video_url": "https://cdn.example/clip.mp4",
            "thumbnail_url": "https://cdn.example/thumb.jpg",
            "created_at": "2024-01-01T00:00:00Z",
        }
    )


def test_hide_unhide_and_visibility_policy() -> None:
    _register_clip()

    initial = client.get("/clips/clip-100", headers=SPECTATOR_HEADERS)
    assert initial.status_code == 200

    # Hide clip
    hide_response = client.post(
        "/admin/moderation/clip-100/action",
        json={"action": "hide"},
        headers=ADMIN_HEADERS,
    )
    assert hide_response.status_code == 200

    hidden_get = client.get("/clips/clip-100", headers=SPECTATOR_HEADERS)
    assert hidden_get.status_code == 404

    list_hidden = client.get(
        "/events/event-55/clips-feed",
        headers=SPECTATOR_HEADERS,
    )
    assert list_hidden.status_code == 200
    assert list_hidden.json() == []

    # Unhide clip restores visibility
    unhide_response = client.post(
        "/admin/moderation/clip-100/action",
        json={"action": "unhide"},
        headers=ADMIN_HEADERS,
    )
    assert unhide_response.status_code == 200

    restored = client.get("/clips/clip-100", headers=SPECTATOR_HEADERS)
    assert restored.status_code == 200

    list_restored = client.get(
        "/events/event-55/clips-feed",
        headers=SPECTATOR_HEADERS,
    )
    assert list_restored.status_code == 200
    assert [item["id"] for item in list_restored.json()] == ["clip-100"]

    # Restrict to event members only
    restrict_response = client.post(
        "/admin/moderation/clip-100/action",
        json={"action": "set_visibility", "visibility": "event"},
        headers=ADMIN_HEADERS,
    )
    assert restrict_response.status_code == 200

    blocked = client.get("/clips/clip-100", headers=SPECTATOR_NO_MEMBER)
    assert blocked.status_code in (403, 404)

    allowed = client.get("/clips/clip-100", headers=SPECTATOR_HEADERS)
    assert allowed.status_code == 200

    public_list_blocked = client.get(
        "/events/event-55/clips-feed",
        headers=SPECTATOR_NO_MEMBER,
    )
    assert public_list_blocked.status_code == 200
    assert public_list_blocked.json() == []
