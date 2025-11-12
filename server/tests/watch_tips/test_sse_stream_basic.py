from __future__ import annotations

import json

import anyio
import pytest

from server.api.routers import watch_tips
from server.services import watch_tip_bus


@pytest.fixture(autouse=True)
def _clear_bus():
    watch_tip_bus.clear()
    yield
    watch_tip_bus.clear()


# Run with anyio so the async generator can be exercised under the configured backend.
@pytest.mark.anyio
async def test_stream_emits_tip_and_ping(monkeypatch) -> None:
    member_id = "mem-sse"
    fake_time = {"value": 0.0}

    monkeypatch.setattr(
        "server.api.routers.watch_tips.PING_INTERVAL_SECONDS", 0.05, raising=True
    )
    monkeypatch.setattr(
        "server.api.routers.watch_tips.POLL_INTERVAL_SECONDS", 0.0, raising=True
    )
    monkeypatch.setattr(watch_tips.time, "time", lambda: fake_time["value"])

    class DummyRequest:
        async def is_disconnected(self) -> bool:  # pragma: no cover - signature match
            return False

    stream = watch_tips._tip_stream(member_id, DummyRequest())

    try:
        with anyio.fail_after(0.2):
            initial = await anext(stream)
        assert ":ok" in initial

        body = watch_tips.TipIn(
            tipId="tip-stream-1",
            title="Approach",
            body="Go for center",
            club="9i",
            playsLike_m=135.0,
            shotRef={"hole": 3, "shot": 1},
        )
        watch_tips.post_tip(member_id, body)

        with anyio.fail_after(0.2):
            tip_event = await anext(stream)
        data_line = next(
            line for line in tip_event.splitlines() if line.startswith("data: ")
        )
        tip_payload = json.loads(data_line.split("data: ", 1)[1])
        assert tip_payload["tipId"] == "tip-stream-1"
        assert tip_payload["club"] == "9i"

        fake_time["value"] = 1.0
        with anyio.fail_after(0.2):
            ping_event = await anext(stream)
        assert ping_event.startswith("event: ping")
    finally:
        fake_time["value"] = 1.0
        await stream.aclose()
