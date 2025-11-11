from fastapi.testclient import TestClient

from server.app import app
from server.routes import live as mod


client = TestClient(app)


def test_exchange_invite_wrong_event(monkeypatch):
    monkeypatch.setattr(
        mod.viewer_token,
        "exchange_invite",
        lambda invite: {
            "token": "t",
            "exp": 999999999,
            "viewerId": "v1",
            "event": "evtX",
        },
        raising=True,
    )
    response = client.post("/events/evtY/live/exchange_invite", json={"invite": "abc"})
    assert response.status_code in (400, 403, 422)
