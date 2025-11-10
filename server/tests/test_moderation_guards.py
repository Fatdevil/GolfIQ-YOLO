from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.routes.moderation import reset_rate_limiter
from server.services import moderation_repo

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def reset_state() -> None:
    moderation_repo.reset()
    reset_rate_limiter()
    yield
    moderation_repo.reset()
    reset_rate_limiter()


def test_admin_queue_requires_admin_headers() -> None:
    response = client.get("/admin/moderation/queue")
    assert response.status_code == 403

    spectator = client.get(
        "/admin/moderation/queue",
        headers={"x-event-role": "spectator", "x-event-member": "viewer"},
    )
    assert spectator.status_code == 403


def test_admin_action_requires_admin_role() -> None:
    response = client.post(
        "/admin/moderation/clip-77/action",
        json={"action": "hide"},
        headers={"x-event-role": "spectator", "x-event-member": "viewer"},
    )
    assert response.status_code == 403

    missing = client.post(
        "/admin/moderation/clip-77/action",
        json={"action": "hide"},
    )
    assert missing.status_code == 403
