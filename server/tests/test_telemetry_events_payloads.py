from collections import defaultdict

import pytest

from server.telemetry import events


@pytest.fixture(autouse=True)
def reset_emitter():
    events.set_events_telemetry_emitter(None)
    yield
    events.set_events_telemetry_emitter(None)


def test_score_and_board_payloads_include_optional_fields():
    captured = []

    def emitter(event_name, payload):
        captured.append((event_name, payload))

    events.set_events_telemetry_emitter(emitter)

    events.record_score_idempotent("evt", fingerprint="fp", revision=7)
    events.record_score_conflict("evt", revision=8, fingerprint="fp2")
    events.record_score_conflict_stale_or_duplicate(
        "evt",
        incoming_revision=10,
        existing_revision=8,
        fingerprint="fp3",
    )
    events.record_board_build("evt", duration_ms=123.4, mode="simple", rows=5)
    events.record_board_resync("evt", reason="manual", attempt=2)
    events.record_host_action("evt", "request", member_id="mem")
    events.record_tv_tick("evt", duration_ms=321.7, source="hud")
    events.record_tv_rotate("evt", interval_ms=99.9, view="leaderboard", source="hud")
    events.emit_clip_commentary_ok("clip", has_tts=True)
    events.emit_clip_commentary_failed("clip", "boom")
    events.emit_clip_commentary_blocked_safe("evt", "clip", "mem")

    events.set_events_telemetry_emitter(None)

    payloads = defaultdict(dict)
    for name, payload in captured:
        payloads[name] = payload

    assert payloads["score.idempotent.accepted"]["fingerprint"] == "fp"
    assert payloads["score.idempotent.accepted"]["revision"] == 7
    assert payloads["conflict.count"]["fingerprint"] == "fp2"
    assert payloads["conflict.count"]["revision"] == 8
    conflict = payloads["score.conflict.stale_or_duplicate"]
    assert conflict["incomingRevision"] == 10
    assert conflict["existingRevision"] == 8
    assert conflict["fingerprint"] == "fp3"
    board = payloads["board.build_ms"]
    assert board["mode"] == "simple"
    assert board["rows"] == 5
    resync = payloads["events.resync"]
    assert resync["reason"] == "manual"
    assert resync["attempt"] == 2
    host = payloads["events.host.action"]
    assert host["memberId"] == "mem"
    tv_tick = payloads["events.tv.tick_ms"]
    assert tv_tick["source"] == "hud"
    rotate = payloads["events.tv.rotate"]
    assert rotate["source"] == "hud"
    assert rotate["view"] == "leaderboard"
    ok = payloads["clip.commentary.ok"]
    assert ok["hasTts"] is True
    failed = payloads["clip.commentary.failed"]
    assert failed["error"] == "boom"
    blocked = payloads["clip.commentary.blocked_safe"]
    assert blocked["memberId"] == "mem"
