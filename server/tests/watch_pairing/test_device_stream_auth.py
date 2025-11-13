from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.responses import StreamingResponse

from server.api.routers import watch_pairing
from server.app import app
from server.services import watch_devices, watch_tip_bus


@pytest.fixture(autouse=True)
def _reset_devices() -> None:
    watch_devices.reset()
    yield
    watch_devices.reset()


@pytest.mark.timeout(10)
@pytest.mark.anyio(backend="asyncio")
async def test_stream_requires_token_and_emits_tip(
    monkeypatch, anyio_backend_name: str
) -> None:
    if anyio_backend_name != "asyncio":
        pytest.skip("watch stream tests require asyncio backend")
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

    tip = watch_tip_bus.Tip(
        tipId="tip-stream-1",
        title="Tempo",
        body="Smooth takeaway",
    )

    class DummyRequest:
        def __init__(self) -> None:
            self.headers: dict[str, str] = {}
            self.client = SimpleNamespace(host="127.0.0.1")

        async def is_disconnected(self) -> bool:  # pragma: no cover - deterministic
            return False

    class ImmediateQueue:
        def __init__(self) -> None:
            self._served = False

        def get(self, block: bool = True, timeout: float | None = None):
            if not self._served:
                self._served = True
                return tip
            raise watch_pairing.Empty

    queue = ImmediateQueue()
    monkeypatch.setattr(
        watch_pairing, "subscribe", lambda member_id: queue, raising=True
    )
    unsubscribed: list[tuple[str, object]] = []
    monkeypatch.setattr(
        watch_pairing,
        "unsubscribe",
        lambda member_id, q: unsubscribed.append((member_id, q)),
        raising=True,
    )

    with pytest.raises(HTTPException) as unauth:
        await watch_pairing.get_device_stream(DummyRequest(), authorization=None)
    assert unauth.value.status_code == 401

    response = await watch_pairing.get_device_stream(
        DummyRequest(), authorization=None, token=token
    )
    assert isinstance(response, StreamingResponse)

    iterator = response.body_iterator
    try:
        initial = await iterator.__anext__()
        assert initial.startswith(":ok")

        event_chunk = await iterator.__anext__()
        assert "event: tip" in event_chunk
        data_line = next(
            line for line in event_chunk.splitlines() if line.startswith("data: ")
        )
        payload = json.loads(data_line.split("data: ", 1)[1])
        assert payload["tipId"] == tip.tipId
    finally:
        await iterator.aclose()

    assert ("watch.stream.open", {"deviceId": device.device_id}) in emitted
    assert ("watch.stream.close", {"deviceId": device.device_id}) in emitted
    assert unsubscribed == [("mem-stream", queue)]


@pytest.mark.timeout(5)
def test_device_stream_requires_authentication() -> None:
    """The SSE endpoint should reject requests without a Bearer token."""

    with TestClient(app) as client:
        response = client.get("/api/watch/devices/stream")

    assert response.status_code == 401


@pytest.mark.timeout(5)
def test_ack_requires_authentication() -> None:
    """Posting an ACK without device credentials must fail."""

    with TestClient(app) as client:
        response = client.post(
            "/api/watch/devices/ack", json={"tipId": "tip-unauthorized"}
        )

    assert response.status_code == 401
