from __future__ import annotations

import importlib


def test_all_event_telemetry_emitters_cover_modes(monkeypatch):
    telemetry = importlib.import_module("server.telemetry.events")

    # No-op mode should not raise even when no emitter is configured.
    telemetry.set_events_telemetry_emitter(None)
    telemetry.record_event_created("evt", "CODE", name="Event")
    telemetry.record_event_joined("evt", member_id="member")
    telemetry.record_board_resync("evt", reason="empty", attempt=2)
    telemetry.record_board_build("evt", 12.3, mode="gross", rows=3)
    telemetry.record_host_action("evt", "start", member_id="member")
    telemetry.record_tv_tick("evt", 10.5, source="loop")
    telemetry.record_tv_rotate("evt", 5.0, "board", source="loop")
    telemetry.record_score_write("evt", 8.2, status="ok", fingerprint="fp", revision=4)
    telemetry.record_score_idempotent("evt", fingerprint="fp", revision=4)
    telemetry.record_score_conflict("evt", revision=4, fingerprint="fp")
    telemetry.record_score_conflict_stale_or_duplicate(
        "evt", incoming_revision=3, existing_revision=4, fingerprint="fp"
    )

    captured: list[tuple[str, dict[str, object]]] = []
    telemetry.set_events_telemetry_emitter(
        lambda name, payload: captured.append((name, dict(payload)))
    )

    telemetry.record_event_created("evt2", "CODE2", name="Another")
    telemetry.record_event_joined("evt2", member_id="member2")
    telemetry.record_board_resync("evt2", reason="cold", attempt=1)
    telemetry.record_board_build("evt2", 22.7, mode="net", rows=5)
    telemetry.record_host_action("evt2", "pause", member_id="host")
    telemetry.record_tv_tick("evt2", 11.4, source="timer")
    telemetry.record_tv_rotate("evt2", 7.0, "leaderboard", source="timer")
    telemetry.record_score_write(
        "evt2", 18.9, status="conflict", fingerprint="fp2", revision=5
    )
    telemetry.record_score_idempotent("evt2", fingerprint="fp2", revision=5)
    telemetry.record_score_conflict("evt2", revision=5, fingerprint="fp2")
    telemetry.record_score_conflict_stale_or_duplicate(
        "evt2", incoming_revision=4, existing_revision=5, fingerprint="fp2"
    )

    telemetry.set_events_telemetry_emitter(None)

    names = {name for name, _payload in captured}
    assert names == {
        "events.create",
        "events.join",
        "events.resync",
        "board.build_ms",
        "events.host.action",
        "events.tv.tick_ms",
        "events.tv.rotate",
        "score.write_ms",
        "score.idempotent.accepted",
        "conflict.count",
        "score.conflict.stale_or_duplicate",
    }

    for _name, payload in captured:
        assert payload["eventId"].startswith("evt")
        assert payload["ts"] >= 0
