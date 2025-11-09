from __future__ import annotations

from typing import List, Tuple

import pytest

from server.telemetry import events as telemetry


@pytest.fixture(autouse=True)
def _reset_emitter():
    telemetry.set_events_telemetry_emitter(None)
    yield
    telemetry.set_events_telemetry_emitter(None)


def test_record_event_created_without_emitter_logs_debug(caplog):
    with caplog.at_level("DEBUG", logger="server.telemetry.events"):
        telemetry.record_event_created("event-1", "ABC123")
    assert "telemetry emitter not configured" in caplog.text


def test_record_event_created_emits_optional_name():
    captured: List[Tuple[str, dict]] = []

    def _emit(name: str, payload):
        captured.append((name, dict(payload)))

    telemetry.set_events_telemetry_emitter(_emit)
    telemetry.record_event_created("event-1", "ABC123", name="League")

    assert captured
    event, payload = captured[0]
    assert event == "events.create"
    assert payload["name"] == "League"


def test_record_event_joined_emits_payload():
    captured: List[Tuple[str, dict]] = []

    def _emit(name: str, payload):
        captured.append((name, dict(payload)))

    telemetry.set_events_telemetry_emitter(_emit)
    telemetry.record_event_joined("event-2", member_id="member-5")

    assert captured
    event, payload = captured[0]
    assert event == "events.join"
    assert payload["eventId"] == "event-2"
    assert payload["memberId"] == "member-5"
    assert isinstance(payload["ts"], int)


def test_record_event_joined_without_member_id():
    captured: List[Tuple[str, dict]] = []

    telemetry.set_events_telemetry_emitter(
        lambda name, payload: captured.append((name, dict(payload)))
    )
    telemetry.record_event_joined("event-4")

    assert captured
    _, payload = captured[-1]
    assert payload["eventId"] == "event-4"
    assert "memberId" not in payload


def test_record_board_resync_includes_optional_fields():
    captured: List[Tuple[str, dict]] = []

    def _emit(name: str, payload):
        captured.append((name, dict(payload)))

    telemetry.set_events_telemetry_emitter(_emit)
    telemetry.record_board_resync("event-3", reason="empty", attempt=2)

    assert captured
    event, payload = captured[0]
    assert event == "events.resync"
    assert payload["reason"] == "empty"
    assert payload["attempt"] == 2
    assert isinstance(payload["ts"], int)


def test_record_board_resync_without_optional_fields():
    captured: List[Tuple[str, dict]] = []

    telemetry.set_events_telemetry_emitter(
        lambda name, payload: captured.append((name, dict(payload)))
    )
    telemetry.record_board_resync("event-6")

    assert captured
    _, payload = captured[-1]
    ts = payload["ts"]
    assert payload == {"eventId": "event-6", "ts": ts}
