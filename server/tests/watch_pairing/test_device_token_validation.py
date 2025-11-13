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


def test_make_device_token_requires_positive_ttl() -> None:
    device = register_device()

    with pytest.raises(ValueError):
        make_device_token(device.device_id, device.device_secret, ttl_sec=0)


def test_make_device_token_rejects_wrong_secret() -> None:
    device = register_device()

    with pytest.raises(KeyError):
        make_device_token(device.device_id, "not-the-secret")


def test_verify_device_token_updates_last_seen_timestamp() -> None:
    device = register_device()
    token = make_device_token(device.device_id, device.device_secret, ttl_sec=120)
    before = device.last_seen_ts

    verified = verify_device_token(token)

    assert verified is not None
    assert verified.device_id == device.device_id
    assert verified.last_seen_ts >= before


def test_verify_device_token_rejects_malformed_strings() -> None:
    assert verify_device_token("not-enough-parts") is None
    assert verify_device_token("a.b") is None
    assert verify_device_token("a.b.c") is None
