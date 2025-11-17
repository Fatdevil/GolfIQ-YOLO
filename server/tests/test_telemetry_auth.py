from __future__ import annotations

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from server.app import app


@pytest.fixture
def _require_api_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "secret")


def test_telemetry_post_requires_api_key(_require_api_key):
    with TestClient(app) as client:
        response = client.post("/telemetry", json={"timestampMs": 1})
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

        ok = client.post(
            "/telemetry",
            json={"timestampMs": 2},
            headers={"x-api-key": "secret"},
        )

    assert ok.status_code == status.HTTP_200_OK
    assert ok.json()["accepted"] == 1


def test_telemetry_batch_requires_api_key(_require_api_key):
    payload = [
        {"session_id": "sess-1", "ts": 1731200000},
        {"session_id": "sess-1", "ts": 1731200001},
    ]

    with TestClient(app) as client:
        missing = client.post("/telemetry/batch", json=payload)
        assert missing.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

        ok = client.post(
            "/telemetry/batch",
            json=payload,
            headers={"x-api-key": "secret"},
        )

    assert ok.status_code == status.HTTP_202_ACCEPTED
    assert ok.json()["accepted"] == len(payload)


def test_telemetry_websocket_requires_api_key(_require_api_key):
    with TestClient(app) as client:
        with pytest.raises(Exception) as excinfo:
            with client.websocket_connect("/ws/telemetry"):
                pass
        denial = excinfo.value
        assert getattr(
            denial, "code", None
        ) == status.WS_1008_POLICY_VIOLATION or getattr(
            denial, "status_code", None
        ) in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

        with client.websocket_connect(
            "/ws/telemetry", headers={"x-api-key": "secret"}
        ) as websocket:
            websocket.send_text("ping")
