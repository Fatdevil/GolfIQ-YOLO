from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from server.app import app
from server.routes import moderation as mod
from server.schemas.moderation import ClipModerationState, Visibility

client = TestClient(app, raise_server_exceptions=False)


def test_hidden_clip_returns_not_visible(monkeypatch):
    monkeypatch.setattr(
        mod.clips_repo,
        "get_clip",
        lambda clip_id: {
            "id": clip_id,
            "event_id": "event-2",
            "created_at": "2024-01-01T00:00:00Z",
        },
        raising=True,
    )
    monkeypatch.setattr(
        mod.clips_repo,
        "to_public",
        lambda record: {"id": record["id"]},
        raising=True,
    )

    def fake_get_state(clip_id: str) -> ClipModerationState:
        return ClipModerationState(
            clipId=clip_id,
            hidden=True,
            visibility=Visibility.public,
            reports=0,
            updatedTs=datetime.now(timezone.utc),
        )

    monkeypatch.setattr(mod.moderation_repo, "get_state", fake_get_state, raising=True)

    response = client.get(
        "/clips/clipHidden",
        headers={"x-event-role": "spectator", "x-event-member": "host1"},
    )
    assert response.status_code in (403, 404)
