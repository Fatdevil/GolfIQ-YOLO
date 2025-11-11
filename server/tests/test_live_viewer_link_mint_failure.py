from fastapi.testclient import TestClient

from server.app import app
from server.routes import live as mod


client = TestClient(app)


def test_viewer_link_returns_503_when_mint_fails(monkeypatch):
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
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("fail")),
        raising=True,
    )
    try:
        response = client.get("/events/evt1/live/viewer_link")
        assert response.status_code in (503, 500)
    finally:
        app.dependency_overrides.pop(mod.require_admin, None)
