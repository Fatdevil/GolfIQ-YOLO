from fastapi.testclient import TestClient

from server.app import app
from server.routes import live as mod


client = TestClient(app)


def test_status_with_no_token_never_returns_hls_path(monkeypatch):
    monkeypatch.setattr(
        mod.live_stream,
        "status_live",
        lambda eid: {"running": True, "hlsPath": "/hls/x/master.m3u8", "viewers": 0},
        raising=True,
    )
    response = client.get("/events/evt1/live/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("running") is True
    assert "hlsPath" not in payload
