from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.api.routers import watch_pairing
from server.services import watch_devices


def setup_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def teardown_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def test_ack_updates_last_ack_tip(monkeypatch) -> None:
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code("mem-ack")
    watch_devices.bind_device_with_code(device.device_id, join_code.code)
    token = watch_devices.make_device_token(
        device.device_id, device.device_secret, ttl_sec=90
    )

    emitted: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        watch_pairing,
        "emit",
        lambda name, payload: emitted.append((name, dict(payload))),
    )

    with TestClient(app) as client:
        unauthorized = client.post("/api/watch/devices/ack", json={"tipId": "tip-1"})
        assert unauthorized.status_code == 401

        ack = client.post(
            "/api/watch/devices/ack",
            json={"tipId": "tip-1"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert ack.status_code == 200
        assert ack.json() == {"status": "ok"}

    stored = watch_devices.get_device(device.device_id)
    assert stored is not None
    assert stored.last_ack_tip_id == "tip-1"

    assert (
        "watch.tip.ack",
        {"deviceId": device.device_id, "tipId": "tip-1"},
    ) in emitted
