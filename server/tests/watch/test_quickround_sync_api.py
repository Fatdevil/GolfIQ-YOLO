from fastapi.testclient import TestClient

from server.app import app
from server.services import watch_devices

client = TestClient(app, raise_server_exceptions=True)


def setup_function() -> None:
    watch_devices.reset()


def _bind_device(member_id: str = "member-1") -> watch_devices.Device:
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code(member_id)
    return watch_devices.bind_device_with_code(device.device_id, join_code.code)


def test_sync_sends_hud_to_bound_device(monkeypatch) -> None:
    device = _bind_device()
    sent: dict[str, object] = {}

    def _fake_send(device_id: str, hud) -> bool:  # type: ignore[override]
        sent["device_id"] = device_id
        sent["hud"] = hud
        return True

    monkeypatch.setattr(
        "server.api.routers.watch_quickround.send_hud_to_device", _fake_send
    )

    response = client.post(
        "/api/watch/quickround/sync",
        json={
            "memberId": device.bound_member_id,
            "runId": "run-123",
            "courseId": None,
            "hole": 3,
        },
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"deviceId": device.device_id, "synced": True}
    assert sent["device_id"] == device.device_id
    assert getattr(sent["hud"], "hole", None) == 3


def test_sync_without_device_returns_unsynced() -> None:
    response = client.post(
        "/api/watch/quickround/sync",
        json={"memberId": "member-2", "runId": "run-123", "hole": 1},
        headers={"x-api-key": "test-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {"deviceId": None, "synced": False}
