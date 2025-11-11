import urllib.parse as up

from fastapi.testclient import TestClient

from server.app import app
from server.routes import live as mod


client = TestClient(app)


def test_viewer_link_uses_web_base_env(monkeypatch):
    base = "https://demo.golfiq.app"
    monkeypatch.setenv("WEB_BASE_URL", base)
    monkeypatch.setattr(
        mod.live_stream,
        "status_live",
        lambda event_id: {"running": True},
        raising=True,
    )
    app.dependency_overrides[mod.require_admin] = lambda: {"memberId": "host1"}
    monkeypatch.setattr(
        mod.viewer_token,
        "mint_invite",
        lambda event_id, ttl_s=900: {"invite": "INV123", "exp": 999999999},
        raising=True,
    )
    try:
        response = client.get("/events/evt99/live/viewer_link")
        assert response.status_code == 200
        url = response.json()["url"]
        assert url.startswith(f"{base}/events/evt99/live-view?invite=")
        assert "invite=" in url and up.urlparse(url).query
    finally:
        app.dependency_overrides.pop(mod.require_admin, None)
