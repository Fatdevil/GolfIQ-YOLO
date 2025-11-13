"""Unbinding coverage for watch devices."""

import pytest

from server.services.watch_devices import (
    bind_device_with_code,
    get_device,
    mint_join_code,
    record_ack,
    register_device,
    reset,
    unbind_device,
)


@pytest.fixture(autouse=True)
def reset_devices() -> None:
    reset()
    yield
    reset()


def test_unbind_device_clears_bound_member_and_ack() -> None:
    device = register_device()
    join_code = mint_join_code("member-x")
    bound = bind_device_with_code(device.device_id, join_code.code)
    assert bound.bound_member_id == "member-x"

    record_ack(device.device_id, "tip-1")
    pre_unbind = get_device(device.device_id)
    assert pre_unbind is not None
    assert pre_unbind.last_ack_tip_id == "tip-1"

    unbind_device(device.device_id)
    after = get_device(device.device_id)
    assert after is not None
    assert after.bound_member_id is None
    assert after.last_ack_tip_id is None


def test_unbind_device_ignores_unknown_device() -> None:
    # Should not raise even if device is missing.
    unbind_device("missing-device")
