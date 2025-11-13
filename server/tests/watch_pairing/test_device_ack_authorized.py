from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import watch_devices


@pytest.fixture(autouse=True)
def reset_devices() -> None:
    watch_devices.reset()
    yield
    watch_devices.reset()


@pytest.mark.timeout(5)
def test_ack_updates_last_ack_tip_id() -> None:
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code("member-ack")
    watch_devices.bind_device_with_code(device.device_id, join_code.code)
    token = watch_devices.make_device_token(
        device.device_id, device.device_secret, ttl_sec=300
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/watch/devices/ack",
            json={"tipId": "tip-ack-1"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"status": "ok"}

    stored = watch_devices.get_device(device.device_id)
    assert stored is not None
    assert stored.last_ack_tip_id == "tip-ack-1"
