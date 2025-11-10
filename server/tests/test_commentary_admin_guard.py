"""Ensure commentary admin routes are protected."""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_list_requires_admin_headers():
    response = client.get("/events/evt123/clips")
    assert response.status_code in (401, 403)


def test_get_requires_admin_headers():
    response = client.get("/clips/clip123/commentary")
    assert response.status_code in (401, 403)
