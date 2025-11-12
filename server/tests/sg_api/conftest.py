from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.api.routers.run_scores import _reset_state
from server.app import app


@pytest.fixture(autouse=True)
def reset_events():
    _reset_state()
    yield
    _reset_state()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
