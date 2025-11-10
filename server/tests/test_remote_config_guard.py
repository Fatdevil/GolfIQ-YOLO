from fastapi.testclient import TestClient
from starlette.requests import Request

from server.app import app
import server.config.remote as remote


def test_remote_config_update_requires_admin_token(monkeypatch):
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    with TestClient(app) as client:
        response = client.post("/config/remote", json={"foo": "bar"})
    assert response.status_code in (401, 403, 503)


def test_remote_config_update_ok_with_token(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "sekret")
    dummy_store_called = {}

    class _DummyStore:
        def update(self, payload):
            dummy_store_called["payload"] = payload
            return payload, "etag-1", "2025-01-01T00:00:00Z"

    monkeypatch.setattr(remote, "_store", _DummyStore())
    with TestClient(app) as client:
        response = client.post(
            "/config/remote",
            json={"foo": {"bar": 1}},
            headers={"x-admin-token": "sekret"},
        )
    assert response.status_code in (200, 201)

    data = response.json()
    assert "config" in data and data["etag"]
    assert dummy_store_called["payload"] == {"foo": {"bar": 1}}


def _request(scope_updates: dict | None = None) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/config/remote",
        "query_string": b"",
        "headers": [],
    }
    if scope_updates:
        scope.update(scope_updates)
    return Request(scope)


def test_is_playslike_qa_enabled_prefers_header():
    request = _request(
        {
            "headers": [(b"x-pl-qa", b"true")],
        }
    )
    assert remote._is_playslike_qa_enabled(request) is True


def test_is_playslike_qa_enabled_falls_back_to_query_and_state():
    request = _request(
        {
            "query_string": b"qa=1",
            "headers": [(b"x-pl-qa", b"invalid")],
        }
    )
    assert remote._is_playslike_qa_enabled(request) is True

    request = _request()
    request.state.playslike_qa = "yes"
    assert remote._is_playslike_qa_enabled(request) is True

    request = _request()
    assert remote._is_playslike_qa_enabled(request) is False
