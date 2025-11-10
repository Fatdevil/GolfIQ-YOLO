from server.telemetry import events as telemetry_events


def test_clip_telemetry_noop():
    telemetry_events.set_events_telemetry_emitter(None)
    telemetry_events.emit_clip_upload_requested(
        eventId="evt-1", clipId="clip-1", size=1024, ct="video/mp4"
    )
    telemetry_events.emit_clip_ready(clipId="clip-1", duration_ms=1200)
    telemetry_events.emit_clip_failed(clipId="clip-1", error="boom")
    telemetry_events.emit_clip_reaction(clipId="clip-1", userId="user-1", emoji="🔥")


def test_clip_telemetry_emits_payloads():
    captured: list[tuple[str, dict]] = []

    def _capture(event: str, payload: dict):
        captured.append((event, payload))

    telemetry_events.set_events_telemetry_emitter(_capture)
    telemetry_events.emit_clip_upload_requested(
        eventId="evt-1", clipId="clip-1", size=2048, ct="video/mp4"
    )
    telemetry_events.emit_clip_ready(clipId="clip-1", duration_ms=1500)
    telemetry_events.emit_clip_failed(clipId="clip-1", error="boom")
    telemetry_events.emit_clip_reaction(clipId="clip-1", userId="user-1", emoji="🔥")

    telemetry_events.set_events_telemetry_emitter(None)

    names = [event for event, _ in captured]
    assert names == [
        "clips.upload.requested",
        "clips.ready",
        "clips.failed",
        "clips.reaction",
    ]
    payload = captured[0][1]
    assert payload["eventId"] == "evt-1"
    assert payload["clipId"] == "clip-1"
