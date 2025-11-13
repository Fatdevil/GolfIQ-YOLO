from __future__ import annotations

import pytest

from server.services import watch_devices


@pytest.fixture(autouse=True)
def reset_devices() -> None:
    watch_devices.reset()
    yield
    watch_devices.reset()


def test_verify_device_token_rejects_bad_signature() -> None:
    device = watch_devices.register_device()
    token = watch_devices.make_device_token(device.device_id, device.device_secret, ttl_sec=300)
    parts = token.split(".")
    assert len(parts) == 3
    tampered = ".".join([parts[0], parts[1], "invalidsig"])

    assert watch_devices.verify_device_token(tampered) is None


def test_verify_device_token_rejects_expired(monkeypatch: pytest.MonkeyPatch) -> None:
    device = watch_devices.register_device()
    token = watch_devices.make_device_token(device.device_id, device.device_secret, ttl_sec=1)
    parts = token.split(".")
    exp_ts = int(parts[1])

    monkeypatch.setattr("server.services.watch_devices._now_s", lambda: exp_ts + 10)

    assert watch_devices.verify_device_token(token) is None
