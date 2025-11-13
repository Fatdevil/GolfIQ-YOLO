from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import watch_devices, watch_tip_bus


@pytest.fixture(autouse=True)
def reset_state() -> None:
    watch_devices.reset()
    watch_tip_bus.clear()
    yield
    watch_devices.reset()
    watch_tip_bus.clear()


@pytest.mark.timeout(10)
def test_device_stream_delivers_tip_and_closes() -> None:
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code("member-stream")
    watch_devices.bind_device_with_code(device.device_id, join_code.code)
    token = watch_devices.make_device_token(
        device.device_id, device.device_secret, ttl_sec=120
    )

    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(app) as client:
        with client.stream(
            "GET", "/api/watch/devices/stream", headers=headers, timeout=5
        ) as response:
            lines = (line for line in response.iter_lines(decode_unicode=True) if line)

            tip_payload = {
                "tipId": "tip-stream-1",
                "title": "First tip",
                "body": "Hello",
            }
            publish_response = client.post(
                "/api/watch/member-stream/tips", json=tip_payload
            )
            assert publish_response.status_code == 200

            saw_tip = False
            for line in lines:
                if line.startswith("event: tip"):
                    data_line = next(lines)
                    assert data_line.startswith("data:")
                    data = json.loads(data_line.split("data:", 1)[1].strip())
                    assert data["tipId"] == "tip-stream-1"
                    saw_tip = True
                    break

            assert saw_tip
