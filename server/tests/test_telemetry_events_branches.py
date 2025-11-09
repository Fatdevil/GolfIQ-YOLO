from __future__ import annotations

from typing import List, Tuple

from server.telemetry import events as telemetry


def test_telemetry_noop_branch() -> None:
    telemetry.set_events_telemetry_emitter(None)
    telemetry.record_host_action("event-1", "start")
    telemetry.record_event_joined("event-1", member_id="spectator")
    telemetry.record_tv_tick("event-1", 512.4, source="tv")


def test_telemetry_configured_branch() -> None:
    captured: List[Tuple[str, dict]] = []

    def _emitter(name: str, payload: dict) -> None:
        captured.append((name, payload))

    telemetry.set_events_telemetry_emitter(_emitter)
    telemetry.record_tv_rotate("event-2", 123.8, "leaders", source="tv")
    telemetry.record_tv_tick("event-2", 980.2)
    telemetry.record_event_created("event-2", "ABC1234", name="Club Night")
    telemetry.record_board_resync("event-2", reason="manual", attempt=2)
    telemetry.record_host_action("event-2", "pause", member_id="m1")

    assert {event for event, _ in captured} >= {
        "events.tv.rotate",
        "events.tv.tick_ms",
        "events.create",
        "events.resync",
        "events.host.action",
    }
    for _, payload in captured:
        assert payload["ts"] >= 0

    telemetry.set_events_telemetry_emitter(None)
