from __future__ import annotations

import time

from fastapi.testclient import TestClient

from server.app import app
from server.api.routers import watch_pairing
from server.services import watch_devices


def setup_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def teardown_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def test_member_can_mint_code_and_bind_device(monkeypatch) -> None:
    events: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        watch_pairing,
        "emit",
        lambda name, payload: events.append((name, dict(payload))),
    )

    with TestClient(app) as client:
        code_resp = client.post("/api/watch/pair/code", params={"memberId": "mem-1"})
        assert code_resp.status_code == 200
        join = code_resp.json()
        assert join["code"].isdigit()
        assert len(join["code"]) == 6
        assert join["expTs"] > 0

        reg_resp = client.post("/api/watch/devices/register")
        assert reg_resp.status_code == 200
        device = reg_resp.json()
        assert device["deviceId"]
        assert device["deviceSecret"]

        bind_resp = client.post(
            "/api/watch/devices/bind",
            json={"deviceId": device["deviceId"], "code": join["code"]},
        )
        assert bind_resp.status_code == 200
        token_payload = bind_resp.json()
        assert token_payload["token"].startswith(device["deviceId"])
        assert token_payload["expTs"] > int(time.time())

    assert ("watch.pair.request", {"memberId": "mem-1"}) in events
    assert any(evt[0] == "watch.pair.complete" for evt in events)


def test_bind_rejects_expired_code(monkeypatch) -> None:
    # Prepare device and join code via services for fine-grained time control
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code("mem-expire", ttl_sec=1)

    # Advance time beyond expiry
    monkeypatch.setattr(watch_devices, "_now_s", lambda: join_code.exp_ts + 10)

    with TestClient(app) as client:
        response = client.post(
            "/api/watch/devices/bind",
            json={"deviceId": device.device_id, "code": join_code.code},
        )
    assert response.status_code == 410
