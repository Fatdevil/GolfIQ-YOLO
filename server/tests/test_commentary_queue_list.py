from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.schemas.commentary import CommentaryStatus
from server.services import commentary_queue
from server.telemetry import events as telemetry_events

client = TestClient(app, raise_server_exceptions=False)

ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-1"}


@pytest.fixture(autouse=True)
def reset_queue():
    commentary_queue.reset()
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    commentary_queue.reset()
    telemetry_events.set_events_telemetry_emitter(None)


def test_requires_admin_headers() -> None:
    response = client.get("/events/event-1/clips")
    assert response.status_code == 403

    response = client.get("/clips/clip-1/commentary")
    assert response.status_code == 403


def test_list_commentary_with_status_filter() -> None:
    now = datetime.now(timezone.utc)
    commentary_queue.upsert(
        "clip-1",
        event_id="event-1",
        status=CommentaryStatus.queued,
        updated_ts=now,
    )
    commentary_queue.upsert(
        "clip-2",
        event_id="event-1",
        status=CommentaryStatus.ready,
        title="Ready highlight",
        summary="Shot drained for birdie",
        updated_ts=now + timedelta(seconds=5),
    )
    commentary_queue.upsert(
        "clip-3",
        event_id="event-2",
        status=CommentaryStatus.failed,
        updated_ts=now + timedelta(seconds=10),
    )

    response = client.get(
        "/events/event-1/clips",
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    payload = response.json()
    assert [item["clipId"] for item in payload] == ["clip-2", "clip-1"]

    filtered = client.get(
        "/events/event-1/clips",
        params={"status": "ready"},
        headers=ADMIN_HEADERS,
    )
    assert filtered.status_code == 200
    ready_payload = filtered.json()
    assert ready_payload == [
        {
            "clipId": "clip-2",
            "status": "ready",
            "title": "Ready highlight",
            "summary": "Shot drained for birdie",
            "ttsUrl": None,
            "updatedTs": payload[0]["updatedTs"],
        }
    ]


def test_get_commentary_returns_latest_fields() -> None:
    now = datetime.now(timezone.utc)
    commentary_queue.upsert(
        "clip-9",
        event_id="event-9",
        status=CommentaryStatus.running,
        updated_ts=now,
    )
    final_record = commentary_queue.upsert(
        "clip-9",
        status=CommentaryStatus.ready,
        event_id="event-9",
        title="Ace celebration",
        summary="Par 3 ace with fist pump",
        tts_url="https://cdn.example.com/clip-9.mp3",
        updated_ts=now + timedelta(seconds=2),
    )

    response = client.get("/clips/clip-9/commentary", headers=ADMIN_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["clipId"] == "clip-9"
    assert body["status"] == "ready"
    assert body["title"] == final_record.title
    assert body["summary"] == final_record.summary
    assert body["ttsUrl"] == final_record.ttsUrl
    normalized = body["updatedTs"].replace("Z", "+00:00")
    assert normalized == final_record.updatedTs.isoformat()


def test_playback_endpoint_emits_telemetry() -> None:
    captured: list[tuple[str, dict[str, object]]] = []

    def _emit(name: str, payload: dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    commentary_queue.upsert(
        "clip-play",
        event_id="event-99",
        status=CommentaryStatus.ready,
    )

    response = client.post(
        "/clips/clip-play/commentary/play",
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 202
    assert captured and captured[-1][0] == "clip.commentary.play_tts"
