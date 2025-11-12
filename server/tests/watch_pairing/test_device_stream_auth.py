from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.api.routers import watch_pairing
from server.services import watch_devices


class _FakeClock:
    def __init__(self) -> None:
        self._value = 1_000.0

    def time(self) -> float:
        self._value += 16.0
        return self._value


def setup_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def teardown_function() -> None:  # noqa: D401 - pytest style
    watch_devices.reset()


def test_stream_requires_token_and_emits_ping(monkeypatch) -> None:
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code("mem-stream")
    watch_devices.bind_device_with_code(device.device_id, join_code.code)
    token = watch_devices.make_device_token(
        device.device_id, device.device_secret, ttl_sec=60
    )

    emitted: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        watch_pairing,
        "emit",
        lambda name, payload: emitted.append((name, dict(payload))),
    )
    fake_clock = _FakeClock()
    monkeypatch.setattr(watch_pairing.time, "time", fake_clock.time)

    with TestClient(app) as client:
        unauth = client.get("/api/watch/devices/stream")
        assert unauth.status_code == 401

        with client.stream(
            "GET", "/api/watch/devices/stream", params={"token": token}
        ) as response:
            assert response.status_code == 200
            chunks = []
            for chunk in response.iter_text():
                chunks.append(chunk)
                if "event: ping" in chunk:
                    break
            assert any(":ok" in chunk for chunk in chunks)
            assert any("event: ping" in chunk for chunk in chunks)

    assert ("watch.stream.open", {"deviceId": device.device_id}) in emitted
    assert ("watch.stream.close", {"deviceId": device.device_id}) in emitted
