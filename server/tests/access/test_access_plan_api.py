from __future__ import annotations

from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.access import service


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.delenv("GOLFIQ_DEFAULT_PLAN", raising=False)
    monkeypatch.delenv("GOLFIQ_PRO_API_KEYS", raising=False)
    service.reload_config()
    with TestClient(app) as test_client:
        yield test_client


def test_returns_free_plan_by_default(client: TestClient) -> None:
    response = client.get("/api/access/plan", headers={"x-api-key": "test-key"})

    assert response.status_code == 200
    assert response.json() == {"plan": "free"}


def test_respects_default_plan_override(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GOLFIQ_DEFAULT_PLAN", "pro")
    service.reload_config()

    response = client.get("/api/access/plan", headers={"x-api-key": "test-key"})

    assert response.status_code == 200
    assert response.json() == {"plan": "pro"}


def test_marks_specific_keys_as_pro(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("GOLFIQ_PRO_API_KEYS", "vip-key,other")
    service.reload_config()

    base_response = client.get("/api/access/plan", headers={"x-api-key": "test-key"})
    assert base_response.status_code == 200
    assert base_response.json() == {"plan": "free"}

    pro_response = client.get("/api/access/plan", headers={"x-api-key": "vip-key"})
    assert pro_response.status_code == 200
    assert pro_response.json() == {"plan": "pro"}
