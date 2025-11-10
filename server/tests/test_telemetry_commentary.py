from __future__ import annotations

from typing import Dict, List, Tuple

import pytest

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

    telemetry_events.emit_clip_commentary_requested("clip-1")
    telemetry_events.emit_clip_commentary_ok("clip-1", has_tts=True)
    telemetry_events.emit_clip_commentary_failed("clip-1", "boom")

    names = [name for name, _payload in captured]
    assert names == [
        "clip.commentary.requested",
        "clip.commentary.ok",
        "clip.commentary.failed",
    ]
    assert captured[1][1]["hasTts"] is True
    assert captured[2][1]["error"] == "boom"


def test_commentary_events_noop_without_emitter():
    telemetry_events.set_events_telemetry_emitter(None)
    telemetry_events.emit_clip_commentary_requested("clip-2")
    telemetry_events.emit_clip_commentary_ok("clip-2", has_tts=False)
    telemetry_events.emit_clip_commentary_failed("clip-2", "err")
    # Should not raise and nothing captured since emitter is None.
