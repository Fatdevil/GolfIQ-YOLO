from __future__ import annotations

import json
from queue import Queue

import pytest

from server.api.routers.watch_pairing import get_device_stream
from server.services import watch_devices, watch_tip_bus
from server.services.watch_tip_bus import Tip


class _DummyClient:
    def __init__(self, host: str = "test-client") -> None:
        self.host = host


class DummyRequest:
    def __init__(self) -> None:
        self.headers: dict[str, str] = {}
        self.client = _DummyClient()
        self._disconnect_checks = 0

    async def is_disconnected(self) -> bool:
        self._disconnect_checks += 1
        return self._disconnect_checks > 1


@pytest.fixture(autouse=True)
def reset_state() -> None:
    watch_devices.reset()
    watch_tip_bus.clear()
    yield
    watch_devices.reset()
    watch_tip_bus.clear()


@pytest.mark.anyio
@pytest.mark.timeout(5)
async def test_device_stream_yields_tip_and_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    device = watch_devices.register_device()
    join_code = watch_devices.mint_join_code("member-stream")
    watch_devices.bind_device_with_code(device.device_id, join_code.code)
    token = watch_devices.make_device_token(
        device.device_id, device.device_secret, ttl_sec=300
    )

    queued_tip = Tip(
        tipId="tip-stream-1",
        title="First tip",
        body="Hello",
        club=None,
        playsLike_m=None,
        shotRef=None,
        ts=0,
    )

    queue: Queue[Tip] = Queue()
    queue.put(queued_tip)

    subscribed: list[str] = []
    unsubscribed: list[str] = []
    emitted: list[tuple[str, dict[str, object]]] = []

    def fake_subscribe(member_id: str) -> Queue[Tip]:
        subscribed.append(member_id)
        return queue

    def fake_unsubscribe(member_id: str, _queue: Queue[Tip]) -> None:
        unsubscribed.append(member_id)

    def fake_emit(event: str, payload: dict[str, object]) -> None:
        emitted.append((event, payload))

    monkeypatch.setattr("server.api.routers.watch_pairing.subscribe", fake_subscribe)
    monkeypatch.setattr(
        "server.api.routers.watch_pairing.unsubscribe", fake_unsubscribe
    )
    monkeypatch.setattr("server.api.routers.watch_pairing.emit", fake_emit)

    request = DummyRequest()
    response = await get_device_stream(request=request, authorization=f"Bearer {token}")

    body = response.body_iterator
    saw_tip = False
    async for chunk in body:
        text = chunk.decode() if isinstance(chunk, (bytes, bytearray)) else str(chunk)
        if text.startswith("event: tip"):
            data_chunk = await body.__anext__()
            data_text = (
                data_chunk.decode()
                if isinstance(data_chunk, (bytes, bytearray))
                else str(data_chunk)
            )
            assert data_text.startswith("data:")
            payload = json.loads(data_text.split("data:", 1)[1].strip())
            assert payload["tipId"] == "tip-stream-1"
            saw_tip = True
            break

    assert saw_tip
    assert subscribed == ["member-stream"]
    assert unsubscribed == ["member-stream"]
    assert ("watch.stream.open", {"deviceId": device.device_id}) in emitted
    assert ("watch.stream.close", {"deviceId": device.device_id}) in emitted
