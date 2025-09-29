from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from server.app import app
from server.routes import ws_telemetry


def test_ws_connect_and_disconnect() -> None:
    client = TestClient(app)

    with client.websocket_connect("/ws/telemetry") as websocket:
        websocket.send_text("ping")

    assert len(ws_telemetry.manager) == 0


def test_broadcast_drops_failed_clients() -> None:
    class FailingWebSocket:
        def __hash__(self) -> int:  # pragma: no cover - deterministic hash for set
            return id(self)

        async def send_json(self, payload: object) -> None:  # pragma: no cover
            raise RuntimeError("boom")

    failing_ws = FailingWebSocket()
    ws_telemetry.manager._connections.add(failing_ws)  # type: ignore[attr-defined]

    try:
        delivered = asyncio.run(ws_telemetry.manager.broadcast({"ok": True}))
    finally:
        ws_telemetry.manager._connections.discard(failing_ws)  # type: ignore[attr-defined]

    assert delivered == 0
    assert len(ws_telemetry.manager) == 0
