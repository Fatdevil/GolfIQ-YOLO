from __future__ import annotations

import pytest

from server.services.watch_devices import (
    bind_device_with_code,
    mint_join_code,
    register_device,
    reset,
)


@pytest.fixture(autouse=True)
def reset_devices() -> None:
    reset()
    yield
    reset()


def test_bind_device_with_code_requires_existing_device() -> None:
    with pytest.raises(KeyError):
        bind_device_with_code("missing-device", "000000")


def test_bind_device_with_code_rejects_expired_join_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    device = register_device()
    join_code = mint_join_code("member-service", ttl_sec=1)

    monkeypatch.setattr(
        "server.services.watch_devices._now_s", lambda: join_code.exp_ts + 5
    )

    with pytest.raises(KeyError):
        bind_device_with_code(device.device_id, join_code.code)
