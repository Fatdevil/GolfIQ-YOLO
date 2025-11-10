from __future__ import annotations

from collections import defaultdict

import pytest

from server.telemetry import events as telemetry_events


@pytest.fixture(autouse=True)
def _reset_emitter() -> None:
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    telemetry_events.set_events_telemetry_emitter(None)


def test_clips_emitters_noop_when_not_configured() -> None:
    telemetry_events.set_events_telemetry_emitter(None)

    telemetry_events.emit_clip_upload_requested(
        eventId="evt-1", clipId="clip-1", size=1024, ct="video/mp4"
    )
    telemetry_events.emit_clip_ready(clipId="clip-1", duration_ms=1500)
    telemetry_events.emit_clip_failed(clipId="clip-1", error="boom")
    telemetry_events.emit_clip_reaction(clipId="clip-1", userId="member-9", emoji="🔥")


def test_clips_emitters_forward_payloads_when_configured() -> None:
    captured: dict[str, list[dict[str, object]]] = defaultdict(list)

    def _capture(event: str, payload: dict[str, object]) -> None:
        captured[event].append(dict(payload))

    telemetry_events.set_events_telemetry_emitter(_capture)

    telemetry_events.emit_clip_upload_requested(
        eventId="evt-2", clipId="clip-2", size=2048, ct="video/mp4"
    )
    telemetry_events.emit_clip_ready(clipId="clip-2", duration_ms=9876)
    telemetry_events.emit_clip_failed(clipId="clip-2", error="ffmpeg")
    telemetry_events.emit_clip_reaction(clipId="clip-2", userId="member-1", emoji="👏")

    assert set(captured) == {
        "clips.upload.requested",
        "clips.ready",
        "clips.failed",
        "clips.reaction",
    }
    assert captured["clips.upload.requested"][0]["clipId"] == "clip-2"
    assert captured["clips.ready"][0]["durationMs"] == 9876
    assert captured["clips.failed"][0]["error"] == "ffmpeg"
    assert captured["clips.reaction"][0]["emoji"] == "👏"


def test_board_build_and_tv_rotate_optional_fields() -> None:
    captured: list[tuple[str, dict[str, object]]] = []

    def _capture(event: str, payload: dict[str, object]) -> None:
        captured.append((event, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_capture)

    telemetry_events.record_board_build("evt-3", 101.4)
    telemetry_events.record_board_build("evt-3", 222.2, mode="stroke", rows=4)
    telemetry_events.record_tv_rotate("evt-3", 1500, "leaderboard")
    telemetry_events.record_tv_rotate("evt-3", 2500, "stats", source="playlist")

    assert captured[0][0] == "board.build_ms"
    assert "mode" not in captured[0][1]
    assert "rows" not in captured[0][1]
    assert captured[1][1]["mode"] == "stroke"
    assert captured[1][1]["rows"] == 4
    assert captured[2][0] == "events.tv.rotate"
    assert "source" not in captured[2][1]
    assert captured[3][1]["source"] == "playlist"
