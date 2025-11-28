"""Smoke tests for the watch HUD API contract."""

from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from server.watch import hud_service

from server.app import app

client = TestClient(app, raise_server_exceptions=True)


def test_get_hole_hud_basic() -> None:
    response = client.post(
        "/api/watch/hud/hole",
        json={"memberId": "m1", "runId": "r1", "hole": 1},
        headers={"x-api-key": "test-key"},
    )
    assert response.status_code == 200
    hud = response.json()
    assert hud["plan"] in {"free", "pro"}
    assert hud["memberId"] == "m1"
    assert hud["runId"] == "r1"
    assert hud["hole"] == 1


def test_hud_tick_returns_minimal_snapshot() -> None:
    response = client.post(
        "/api/watch/hud/tick",
        json={"memberId": "m1", "runId": "r1", "hole": 1, "deviceId": "dev1"},
        headers={"x-api-key": "test-key"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["hole"] == 1
    assert data["plan"] in {"free", "pro"}
    assert "hasNewTip" in data


def test_get_hole_hud_uses_query_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str | None] = []

    def _lookup(key: str | None) -> str:
        seen.append(key)
        return "pro"

    monkeypatch.setattr(hud_service, "lookup_plan_for_key", _lookup)

    response = client.post(
        "/api/watch/hud/hole?apiKey=query-pro",
        json={"memberId": "m1", "runId": "r1", "hole": 1},
    )

    assert response.status_code == 200
    assert seen == ["query-pro"]
    assert response.json()["plan"] == "pro"


def test_hud_tick_uses_query_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str | None] = []

    def _lookup(key: str | None) -> str:
        seen.append(key)
        return "pro"

    monkeypatch.setattr(hud_service, "lookup_plan_for_key", _lookup)

    response = client.post(
        "/api/watch/hud/tick?apiKey=query-pro",
        json={"memberId": "m1", "runId": "r1", "hole": 1, "deviceId": "dev1"},
    )

    assert response.status_code == 200
    assert seen == ["query-pro"]
    assert response.json()["plan"] == "pro"
