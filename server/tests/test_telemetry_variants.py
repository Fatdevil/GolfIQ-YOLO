from __future__ import annotations

import importlib


def test_score_emit_noop(monkeypatch):
    telemetry = importlib.import_module("server.telemetry.events")
    telemetry.set_events_telemetry_emitter(None)

    telemetry.record_score_write("evt", 12.5, status="ok", fingerprint="fp", revision=2)
    telemetry.record_score_conflict("evt", revision=2, fingerprint="fp")
    telemetry.record_score_conflict_stale_or_duplicate(
        "evt", incoming_revision=1, existing_revision=2, fingerprint="fp"
    )


def test_score_emit_configured(monkeypatch):
    telemetry = importlib.import_module("server.telemetry.events")
    captured: list[tuple[str, dict[str, object]]] = []

    def _capture(name: str, payload: dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry.set_events_telemetry_emitter(_capture)
    try:
        telemetry.record_score_write(
            "evt", 33.0, status="conflict", fingerprint="fp", revision=4
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

    for _name, payload in captured:
        assert payload["eventId"] == "evt"
        assert payload["ts"] >= 0
