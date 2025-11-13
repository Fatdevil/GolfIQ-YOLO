"""Device token verification edge-case coverage."""

import pytest

from server.services.watch_devices import (
    make_device_token,
    register_device,
    reset,
    verify_device_token,
)


@pytest.fixture(autouse=True)
def reset_devices() -> None:
    reset()
    yield
    reset()


def test_verify_device_token_rejects_bad_signature() -> None:
    device = register_device()
    token = make_device_token(device.device_id, device.device_secret, ttl_sec=300)
    parts = token.split(".")
    assert len(parts) == 3
    tampered = ".".join([parts[0], parts[1], "invalidsig"])

    assert verify_device_token(tampered) is None


def test_verify_device_token_rejects_expired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    device = register_device()
    token = make_device_token(device.device_id, device.device_secret, ttl_sec=1)
    parts = token.split(".")
    exp_ts = int(parts[1])

    monkeypatch.setattr("server.services.watch_devices._now_s", lambda: exp_ts + 10)

    assert verify_device_token(token) is None
