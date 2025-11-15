import json

import pytest
from httpx import ASGITransport, AsyncClient

from server.api.routers.trip import stream_trip
from server.app import app
from server.trip import events, store


def _clear_state() -> None:
    store._TRIPS.clear()  # type: ignore[attr-defined]
    events._SUBSCRIBERS.clear()  # type: ignore[attr-defined]


def _decode_event(raw: bytes) -> dict:
    line = raw.decode()
    if line.startswith("data: "):
        return json.loads(line[len("data: ") :])
    raise AssertionError(f"Unexpected SSE payload: {line}")


@pytest.mark.anyio
async def test_trip_sse_stream_emits_updates() -> None:
    _clear_state()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        create_payload = {
            "courseName": "Pebble Beach",
            "holes": 3,
            "players": ["Alice", "Bob"],
        }
        create_response = await client.post("/api/trip/rounds", json=create_payload)
        assert create_response.status_code == 200
        trip_id = create_response.json()["id"]

        streaming_response = await stream_trip(trip_id)
        try:
            generator = streaming_response.body_iterator
            initial = _decode_event(await generator.__anext__())
            assert initial["id"] == trip_id
            assert initial["scores"] == []

            scores_payload = {
                "scores": [
                    {"hole": 1, "player_id": "p1", "strokes": 4},
                    {"hole": 1, "player_id": "p2", "strokes": 5},
                ]
            }
            update_response = await client.post(
                f"/api/trip/rounds/{trip_id}/scores", json=scores_payload
            )
            assert update_response.status_code == 200

            updated = _decode_event(await generator.__anext__())
            totals = {(s["hole"], s["player_id"]): s for s in updated["scores"]}
            assert totals[(1, "p1")]["strokes"] == 4
            assert totals[(1, "p2")]["strokes"] == 5
        finally:
            await generator.aclose()
