import re

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.schemas.anchors import AnchorIn
from server.schemas.moderation import ModerationAction
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


def _seed_anchor(
    run_id: str, hole: int, shot: int, clip_id: str, start_ms: int
) -> None:
    create_or_confirm(
        run_id,
        AnchorIn(
            hole=hole,
            shot=shot,
            clipId=clip_id,
            tStartMs=start_ms,
            tEndMs=start_ms + 3000,
        ),
    )


def test_resolve_redirects_and_og_contains_meta():
    _seed_anchor("run-share", 3, 2, "clip-share", 2750)

    response = client.post(
        "/api/share/anchor",
        json={"runId": "run-share", "hole": 3, "shot": 2},
        headers={"x-api-key": "test-share-key"},
    )
    assert response.status_code == 200
    payload = response.json()
    sid = payload["sid"]

    redirect = client.get(f"/s/{sid}", follow_redirects=False)
    assert redirect.status_code == 302
    assert redirect.headers["location"] == "/clip/clip-share?t=2750"

    og = client.get(f"/s/{sid}/o")
    assert og.status_code == 200
    body = og.text
    assert '<meta property="og:title" content="GolfIQ • H3 S2"/>' in body
    assert "Shot highlight (Strokes-Gained) – watch from the exact moment." in body
    assert (
        '<meta property="og:url" content="http://testserver/clip/clip-share?t=2750"/>'
        in body
    )
    match = re.search(r'<meta property="og:image" content="([^"]*)"', body)
    assert match, body
    assert match.group(1).startswith("http")
    assert 'location.replace("http://testserver/clip/clip-share?t=2750")' in body

    moderation_repo.apply_action("clip-share", action=ModerationAction.hide)

    hidden_redirect = client.get(f"/s/{sid}", follow_redirects=False)
    assert hidden_redirect.status_code == 404

    hidden_og = client.get(f"/s/{sid}/o")
    assert hidden_og.status_code == 404
