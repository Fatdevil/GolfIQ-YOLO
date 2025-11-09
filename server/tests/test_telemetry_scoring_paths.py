from __future__ import annotations

from typing import List, Tuple

from server.telemetry import events as telemetry


def test_score_telemetry_no_emitter() -> None:
    telemetry.set_events_telemetry_emitter(None)
    telemetry.record_score_write("evt", 12.4, status="ok", fingerprint="fp", revision=2)
    telemetry.record_score_idempotent("evt", fingerprint="fp", revision=2)
    telemetry.record_score_conflict("evt", revision=2, fingerprint="fp")
    telemetry.record_score_conflict_stale_or_duplicate(
        "evt", incoming_revision=1, existing_revision=2, fingerprint="fp"
    )


def test_score_telemetry_emitter_records_payloads() -> None:
    captured: List[Tuple[str, dict]] = []

    def _emitter(name: str, payload: dict) -> None:
        captured.append((name, dict(payload)))

    telemetry.set_events_telemetry_emitter(_emitter)
    telemetry.record_score_write(
        "evt", 25.9, status="conflict", fingerprint="fp2", revision=3
    )
    telemetry.record_score_idempotent("evt", fingerprint="fp2", revision=3)
    telemetry.record_score_conflict("evt", revision=3, fingerprint="fp2")
    telemetry.record_score_conflict_stale_or_duplicate(
        "evt", incoming_revision=2, existing_revision=3, fingerprint="fp2"
    )

    events = {name for name, _ in captured}
    assert events >= {
        "score.write_ms",
        "score.idempotent.accepted",
        "conflict.count",
        "score.conflict.stale_or_duplicate",
    }
    for _, payload in captured:
        assert payload["eventId"] == "evt"
        assert payload["ts"] >= 0

    telemetry.set_events_telemetry_emitter(None)
