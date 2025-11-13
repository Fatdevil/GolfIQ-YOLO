from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
