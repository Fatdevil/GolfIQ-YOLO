from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import clips_repo
from server.telemetry import events as telemetry_events


client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    telemetry_events.set_events_telemetry_emitter(None)


def _register_clip(clip_id: str, event_id: str) -> None:
    clips_repo.register_clip(
        {
            "id": clip_id,
            "event_id": event_id,
            "player_name": "Avery",
            "video_url": "https://cdn.example.com/clip.mp4",
            "thumbnail_url": "https://cdn.example.com/thumb.jpg",
            "created_at": "2024-01-01T09:00:00Z",
            "duration_sec": 14.0,
        }
    )


def test_post_metrics_holeout_and_get_clip() -> None:
    clip_id = "clip-edge"
    event_id = "event-edge"
    _register_clip(clip_id, event_id)

    response = client.post(
        f"/clips/{clip_id}/metrics",
        headers={"x-event-role": "admin"},
        json={
            "startDistM": 3.0,
            "strokesUsed": 1,
            "lieStart": "green",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "sgDelta" in payload
    assert "anchorSec" in payload

    clip_response = client.get(
        f"/clips/{clip_id}",
        headers={"x-event-role": "admin"},
    )
    assert clip_response.status_code == 200
    clip_payload = clip_response.json()
    assert "sgDelta" in clip_payload
    assert clip_payload["sgDelta"] == pytest.approx(payload["sgDelta"], rel=1e-6)
