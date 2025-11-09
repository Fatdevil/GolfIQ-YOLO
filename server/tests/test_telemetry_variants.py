from __future__ import annotations

from typing import Dict, List, Tuple

from server.telemetry import events as telemetry


def test_score_emitters_noop_without_emitter() -> None:
    telemetry.set_events_telemetry_emitter(None)
    telemetry.record_score_write("evt", 12.5, status="ok")
    telemetry.record_score_conflict("evt", revision=None, fingerprint=None)
    telemetry.record_score_conflict_stale_or_duplicate(
        "evt", incoming_revision=None, existing_revision=None
    )


def test_score_emitters_capture_payload(monkeypatch) -> None:
    captured: List[Tuple[str, Dict[str, object]]] = []

    def _capture(event: str, payload: Dict[str, object]) -> None:
        captured.append((event, dict(payload)))

    telemetry.set_events_telemetry_emitter(_capture)
    try:
        telemetry.record_score_write(
            "evt", 33.7, status="conflict", fingerprint="fp", revision=4
        )
        telemetry.record_score_conflict("evt", revision=4, fingerprint="fp")
        telemetry.record_score_conflict_stale_or_duplicate(
            "evt", incoming_revision=3, existing_revision=4, fingerprint="fp"
        )
    finally:
        telemetry.set_events_telemetry_emitter(None)

    events = {name for name, _payload in captured}
    assert events == {
        "score.write_ms",
        "conflict.count",
        "score.conflict.stale_or_duplicate",
    }

    for _event_name, payload in captured:
        assert payload["eventId"] == "evt"
        assert payload["ts"] >= 0
