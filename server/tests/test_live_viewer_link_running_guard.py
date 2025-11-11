from fastapi.testclient import TestClient

from server.app import app
from server.routes import live as mod


client = TestClient(app)


def test_viewer_link_409_when_not_running(monkeypatch):
    monkeypatch.setattr(
        mod.live_stream,
        "status_live",
        lambda eid: {"running": False},
        raising=True,
    )
    app.dependency_overrides[mod.require_admin] = lambda: {"memberId": "host1"}
    try:
        response = client.get("/events/evt1/live/viewer_link")
        assert response.status_code in (409, 412)
    finally:
        app.dependency_overrides.pop(mod.require_admin, None)
