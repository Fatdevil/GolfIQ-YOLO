from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.routes.moderation import reset_rate_limiter
from server.services import moderation_repo

client = TestClient(app, raise_server_exceptions=False)

ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-1"}


@pytest.fixture(autouse=True)
def reset_state() -> None:
    moderation_repo.reset()
    reset_rate_limiter()
    yield
    moderation_repo.reset()
    reset_rate_limiter()


def test_report_flow_and_queue_listing() -> None:
    payload = {
        "reason": "Unsportsmanlike clip",
        "details": {"note": "language"},
        "reporter": "spectator-9",
    }
    response = client.post("/clips/clip-1/report", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["reason"] == payload["reason"]
    assert body["status"] == "open"
    assert body["clipId"] == "clip-1"

    queue = client.get("/admin/moderation/queue", headers=ADMIN_HEADERS)
    assert queue.status_code == 200
    items = queue.json()
    assert len(items) == 1
    assert items[0]["clipId"] == "clip-1"
    assert items[0]["reports"] == 1
    assert items[0]["hidden"] is False
