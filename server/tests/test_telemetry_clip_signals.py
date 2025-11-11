from __future__ import annotations

from server.services import telemetry as telemetry_service


def test_clip_telemetry_emits_optional_fields(monkeypatch) -> None:
    captured: list[tuple[str, dict[str, object]]] = []

    def fake_emit(event: str, payload: dict[str, object]) -> None:
        captured.append((event, payload))

    monkeypatch.setattr(telemetry_service, "_emit", fake_emit)

    telemetry_service.emit_commentary_blocked_safe(
        "evt-1", "clip-1", member_id="member-1"
    )
    telemetry_service.emit_clip_moderation_hide("clip-2", member_id="member-2")
    telemetry_service.emit_clip_moderation_unhide("clip-3", member_id="member-3")
    telemetry_service.emit_clip_visibility_changed(
        "clip-4", visibility="hidden", member_id="member-4"
    )
    telemetry_service.emit_clip_sg_recorded("clip-5", sg_delta=0.45, anchor_sec=7.5)
    telemetry_service.emit_clip_rank_evaluated("evt-2", clip_count=5, top_score=9.2)

    events = {name: payload for name, payload in captured}

    assert events["clip.commentary.blocked_safe"]["memberId"] == "member-1"
    assert events["clip.moderation.hide"]["memberId"] == "member-2"
    assert events["clip.moderation.unhide"]["memberId"] == "member-3"
    assert events["clip.visibility.changed"]["memberId"] == "member-4"
    assert events["clip.sg.recorded"]["anchorSec"] == 7.5
    assert events["clip.rank.evaluated"]["topScore"] == 9.2
