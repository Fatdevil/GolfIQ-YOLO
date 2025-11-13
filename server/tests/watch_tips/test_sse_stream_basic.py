from __future__ import annotations

import json

import anyio
import pytest

from server.api.routers import watch_tips
from server.services import watch_tip_bus


@pytest.fixture(autouse=True)
def _reset_bus():
    watch_tip_bus.clear()
    yield
    watch_tip_bus.clear()


@pytest.mark.anyio
async def test_stream_emits_single_tip_and_closes(monkeypatch) -> None:
    member_id = "mem-sse"
    fake_time = {"value": 0.0}

    monkeypatch.setattr(
        "server.api.routers.watch_tips.POLL_INTERVAL_SECONDS", 0.0, raising=True
    )
    monkeypatch.setattr(
        "server.api.routers.watch_tips.PING_INTERVAL_SECONDS", 60.0, raising=True
    )
    monkeypatch.setattr(watch_tips.time, "time", lambda: fake_time["value"])

    class DummyRequest:
        async def is_disconnected(self) -> bool:  # pragma: no cover - signature match
            return False

    stream = watch_tips._tip_stream(member_id, DummyRequest())

    body = watch_tips.TipIn(
        tipId="tip-stream-1",
        title="Approach",
        body="Go for center",
        club="9i",
        playsLike_m=135.0,
        shotRef={"hole": 3, "shot": 1},
    )

    try:
        with anyio.fail_after(0.2):
            initial = await anext(stream)
        assert initial.startswith(":ok")

        watch_tips.post_tip(member_id, body)

        with anyio.fail_after(0.2):
            event = await anext(stream)

        data_line = next(
            line for line in event.splitlines() if line.startswith("data: ")
        )
        payload = json.loads(data_line.split("data: ", 1)[1])
        assert payload["tipId"] == body.tipId
    finally:
        await stream.aclose()
