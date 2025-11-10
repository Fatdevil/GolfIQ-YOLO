import importlib

from fastapi.testclient import TestClient

from server.app import app


def test_host_action_denied_without_admin_headers(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    repository = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repository)
    event = repository.create_event("Admin Guard", None, code="GUARD1")

    with TestClient(app) as client:
        response = client.post(f"/events/{event['id']}/start")

    assert response.status_code in (401, 403)


def test_host_action_allows_with_admin_headers(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    repository = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repository)
    event = repository.create_event("Admin Guard", None, code="GUARD2")

    app.dependency_overrides[events_module.require_admin] = lambda: "host-allow"

    try:
        with TestClient(app) as client:
            response = client.post(
                f"/events/{event['id']}/start",
                headers={"x-event-role": "admin", "x-event-member": "host-allow"},
            )
    finally:
        app.dependency_overrides.pop(events_module.require_admin, None)

    assert response.status_code in (200, 202, 204)
