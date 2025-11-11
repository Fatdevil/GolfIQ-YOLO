from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.routes.feed import reset_cache_for_tests
from server.schemas.moderation import ModerationAction, Visibility
from server.services import moderation_repo

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def reset_state() -> None:
    reset_cache_for_tests()
    moderation_repo.reset()
    yield
    reset_cache_for_tests()
    moderation_repo.reset()


def test_home_feed_excludes_hidden_and_restricted(monkeypatch):
    sample = [
        {
            "id": "clip-public",
            "event_id": "event-a",
            "score": 3.2,
            "created_at": "2024-03-01T10:00:00Z",
        },
        {
            "id": "clip-hidden",
            "event_id": "event-a",
            "score": 2.7,
            "created_at": "2024-03-01T10:05:00Z",
        },
        {
            "id": "clip-event",
            "event_id": "event-b",
            "score": 2.5,
            "created_at": "2024-03-01T10:10:00Z",
        },
    ]

    monkeypatch.setattr(
        "server.routes.feed.clips_repo.list_recent",
        lambda limit=None: list(sample),
        raising=True,
    )

    def fake_rank(entries, now_ts):  # noqa: ANN001
        return list(entries)

    monkeypatch.setattr(
        "server.routes.feed.ranking.rank_top_shots",
        fake_rank,
        raising=True,
    )

    moderation_repo.apply_action("clip-hidden", action=ModerationAction.hide)
    moderation_repo.apply_action(
        "clip-event",
        action=ModerationAction.set_visibility,
        visibility=Visibility.event,
    )

    response = client.get("/feed/home")
    assert response.status_code == 200
    body = response.json()

    assert [item["clipId"] for item in body["topShots"]] == ["clip-public"]
