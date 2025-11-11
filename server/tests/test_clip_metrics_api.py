from __future__ import annotations

from typing import Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import clips_repo, sg
from server.telemetry import events as telemetry_events


client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    telemetry_events.set_events_telemetry_emitter(None)


@pytest.fixture
def telemetry_sink() -> List[Tuple[str, Dict[str, object]]]:
    captured: List[Tuple[str, Dict[str, object]]] = []

    def _emit(name: str, payload: Dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def _register_clip(clip_id: str, event_id: str) -> None:
    clips_repo.register_clip(
        {
            "id": clip_id,
            "event_id": event_id,
            "player_name": "Zara",
            "video_url": "https://cdn.example.com/clip.mp4",
            "thumbnail_url": "https://cdn.example.com/thumb.jpg",
            "created_at": "2024-01-01T10:00:00Z",
            "duration_sec": 12.0,
        }
    )


def test_post_clip_metrics_records_sg_and_anchor(telemetry_sink) -> None:
    clip_id = "clip-123"
    event_id = "event-9"
    _register_clip(clip_id, event_id)

    response = client.post(
        f"/clips/{clip_id}/metrics",
        headers={"x-event-role": "admin"},
        json={
            "startDistM": 120.0,
            "endDistM": 5.0,
            "strokesUsed": 1,
            "lieStart": "fairway",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    expected_sg = sg.sg_delta(120.0, 5.0, strokes_used=1, lie_start="fairway")
    assert payload["sgDelta"] == pytest.approx(expected_sg, rel=1e-6)
    assert payload["anchorSec"] == pytest.approx(6.0, rel=1e-6)

    stored = clips_repo.get_clip(clip_id)
    assert "sg_delta" in stored
    assert stored["sg_delta"] == pytest.approx(payload["sgDelta"], rel=1e-6)
    assert stored["anchors"] == pytest.approx([6.0], rel=1e-6)

    assert any(name == "clip.sg.recorded" for name, _ in telemetry_sink)

    clip_response = client.get(
        f"/clips/{clip_id}",
        headers={"x-event-role": "admin"},
    )
    assert clip_response.status_code == 200
    clip_body = clip_response.json()
    assert clip_body["sgDelta"] == pytest.approx(payload["sgDelta"], rel=1e-6)
    assert clip_body["anchors"] == pytest.approx([6.0], rel=1e-6)
