from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.services.shortlinks import _reset_state as reset_shortlinks

client = TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def reset_state() -> None:
    reset_shortlinks()
    yield
    reset_shortlinks()


def test_shortlink_resolve_unknown_sid_returns_404() -> None:
    response = client.get("/s/this-id-does-not-exist", follow_redirects=False)
    assert response.status_code == 404


def test_shortlink_og_unknown_sid_returns_404() -> None:
    response = client.get("/s/this-id-does-not-exist/o")
    assert response.status_code == 404
