from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient

from server.app import app
from server.services import watch_devices


def setup_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def teardown_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def test_status_returns_unpaired_when_no_device() -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/watch/devices/status", params={"memberId": "member-unpaired"}
        )

    assert response.status_code == 200
    assert response.json() == {"paired": False, "lastSeenAt": None}


def test_status_reflects_primary_device_last_seen(timewarp) -> None:
    device = watch_devices.register_device()
    join = watch_devices.mint_join_code("mem-1")
    watch_devices.bind_device_with_code(device.device_id, join.code)

    # Advance simulated clock and record an ACK to bump last_seen_ts
    timewarp(120)
    watch_devices.record_ack(device.device_id, "tip-123")

    with TestClient(app) as client:
        response = client.get("/api/watch/devices/status", params={"memberId": "mem-1"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["paired"] is True
    parsed = datetime.fromisoformat(payload["lastSeenAt"])
    expected_ts = timewarp(0)
    assert parsed.tzinfo is not None
    assert abs(parsed.timestamp() - expected_ts) < 1.0
