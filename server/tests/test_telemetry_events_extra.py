from __future__ import annotations

from typing import List, Tuple

from server.telemetry import events as telemetry


def test_telemetry_noop_branch() -> None:
    telemetry.set_events_telemetry_emitter(None)
    telemetry.record_host_action("event-1", "start")
    telemetry.record_event_joined("event-1", member_id="spectator")


def test_telemetry_configured_branch() -> None:
    captured: List[Tuple[str, dict]] = []

    def _emitter(name: str, payload: dict) -> None:
        captured.append((name, payload))

    telemetry.set_events_telemetry_emitter(_emitter)
    telemetry.record_tv_rotate("event-2", 123.8, "leaders", source="tv")
    telemetry.record_event_created("event-2", "ABC1234", name="Club Night")

    assert any(event == "events.tv.rotate" for event, _ in captured)
    assert any(event == "events.create" for event, _ in captured)
    for _, payload in captured:
        assert payload["ts"] >= 0

    telemetry.set_events_telemetry_emitter(None)
