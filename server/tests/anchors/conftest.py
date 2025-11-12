from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services.anchors_store import _reset_state


@pytest.fixture(autouse=True)
def _anchors_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "test-key")
    _reset_state()
    yield
    _reset_state()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers() -> dict[str, str]:
    return {"x-api-key": "test-key"}
