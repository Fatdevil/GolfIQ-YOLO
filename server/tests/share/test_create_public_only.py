from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.schemas.anchors import AnchorIn
from server.schemas.moderation import ModerationAction, Visibility
from server.services import moderation_repo
from server.services.anchors_store import _reset_state as reset_anchors
from server.services.anchors_store import create_or_confirm
from server.services.shortlinks import _reset_state as reset_shortlinks

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("API_KEY", "test-share-key")
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    reset_anchors()
    moderation_repo.reset()
    reset_shortlinks()
    yield
    reset_anchors()
    moderation_repo.reset()
    reset_shortlinks()


def _seed_anchor(run_id: str, hole: int, shot: int, clip_id: str) -> None:
    create_or_confirm(
        run_id,
        AnchorIn(
            hole=hole,
            shot=shot,
            clipId=clip_id,
            tStartMs=1500,
            tEndMs=4500,
        ),
    )


def test_create_shortlink_for_public_anchor():
    _seed_anchor("run-public", 1, 1, "clip-public")

    response = client.post(
        "/api/share/anchor",
        json={"runId": "run-public", "hole": 1, "shot": 1},
        headers={"x-api-key": "test-share-key"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["sid"]
    assert payload["url"].startswith("/s/")
    assert payload["ogUrl"] == f"{payload['url']}/o"


def test_create_rejects_non_public_clip():
    _seed_anchor("run-hidden", 1, 1, "clip-hidden")
    moderation_repo.apply_action("clip-hidden", action=ModerationAction.hide)

    hidden_response = client.post(
        "/api/share/anchor",
        json={"runId": "run-hidden", "hole": 1, "shot": 1},
        headers={"x-api-key": "test-share-key"},
    )
    assert hidden_response.status_code == 409

    _seed_anchor("run-event", 2, 1, "clip-event")
    moderation_repo.apply_action(
        "clip-event",
        action=ModerationAction.set_visibility,
        visibility=Visibility.event,
    )

    event_response = client.post(
        "/api/share/anchor",
        json={"runId": "run-event", "hole": 2, "shot": 1},
        headers={"x-api-key": "test-share-key"},
    )
    assert event_response.status_code == 409
