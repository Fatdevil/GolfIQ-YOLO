from __future__ import annotations

from typing import Dict, List, Tuple

import pytest

from server.services import telemetry as commentary_telemetry
from server.telemetry import events as telemetry_events


@pytest.fixture(autouse=True)
def reset_emitter():
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    telemetry_events.set_events_telemetry_emitter(None)


def test_commentary_events_emit_payload():
    captured: List[Tuple[str, Dict[str, object]]] = []

    def _emit(name: str, payload: Dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)

    commentary_telemetry.emit_commentary_request("event-1", "clip-1")
    commentary_telemetry.emit_commentary_running("event-1", "clip-1")
    commentary_telemetry.emit_commentary_done("event-1", "clip-1", has_tts=True)
    commentary_telemetry.emit_commentary_failed("event-1", "clip-1", "boom")
    commentary_telemetry.emit_commentary_blocked_safe(
        "event-1", "clip-1", member_id="host"
    )
    commentary_telemetry.emit_commentary_play_tts("event-1", "clip-1")

    names = [name for name, _payload in captured]
    assert names == [
        "clip.commentary.request",
        "clip.commentary.running",
        "clip.commentary.done",
        "clip.commentary.failed",
        "clip.commentary.blocked_safe",
        "clip.commentary.play_tts",
    ]
    assert captured[2][1]["hasTts"] is True
    assert captured[3][1]["error"] == "boom"
    assert captured[4][1]["memberId"] == "host"


def test_commentary_events_noop_without_emitter():
    telemetry_events.set_events_telemetry_emitter(None)
    commentary_telemetry.emit_commentary_request("event-2", "clip-2")
    commentary_telemetry.emit_commentary_running("event-2", "clip-2")
    commentary_telemetry.emit_commentary_done("event-2", "clip-2", has_tts=False)
    commentary_telemetry.emit_commentary_failed("event-2", "clip-2", "err")
    # Should not raise and nothing captured since emitter is None.
