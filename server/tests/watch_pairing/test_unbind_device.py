from __future__ import annotations

import pytest

from server.services import watch_devices


@pytest.fixture(autouse=True)
def reset_devices() -> None:
    watch_devices.reset()
    yield
    watch_devices.reset()


def test_unbind_device_clears_bound_member_and_ack() -> None:
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code("member-x")
    bound = watch_devices.bind_device_with_code(device.device_id, join_code.code)
    assert bound.bound_member_id == "member-x"

    watch_devices.record_ack(device.device_id, "tip-1")
    unbound = watch_devices.get_device(device.device_id)
    assert unbound is not None
    assert unbound.last_ack_tip_id == "tip-1"

    watch_devices.unbind_device(device.device_id)
    after = watch_devices.get_device(device.device_id)
    assert after is not None
    assert after.bound_member_id is None
    assert after.last_ack_tip_id is None
