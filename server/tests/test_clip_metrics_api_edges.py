from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import clips as clips_routes
from server.services import clips_repo, ranking
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


def test_clip_metrics_missing_clip_returns_404() -> None:
    response = client.post(
        "/clips/missing/metrics",
        headers={"x-event-role": "admin"},
        json={"startDistM": 10.0, "strokesUsed": 1},
    )

    assert response.status_code == 404


def test_derive_anchor_prefers_valid_values() -> None:
    clip = {"anchors": ["invalid", "4.2"], "impactOffsetSec": "6.5", "duration_sec": 12}
    assert clips_routes._derive_anchor(clip) == pytest.approx(4.2, rel=1e-6)

    clip_impact = {"impactOffsetSec": "3.3", "duration_sec": 9}
    assert clips_routes._derive_anchor(clip_impact) == pytest.approx(3.3, rel=1e-6)

    clip_duration = {"duration_sec": 8.0}
    assert clips_routes._derive_anchor(clip_duration) == pytest.approx(4.0, rel=1e-6)

    clip_invalid = {"impactOffsetSec": "not-a-number", "duration_sec": "oops"}
    assert clips_routes._derive_anchor(clip_invalid) == 0.0


def test_top_shots_empty_emits_telemetry(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[dict[str, object]] = []

    monkeypatch.setattr(clips_repo, "list_for_event", lambda _: [])
    monkeypatch.setattr(
        clips_routes.telemetry_service,
        "emit_clip_rank_evaluated",
        lambda event_id, **payload: captured.append({"event": event_id, **payload}),
    )

    response = client.get(
        "/events/evt-empty/top-shots",
        headers={"x-event-role": "admin"},
    )

    assert response.status_code == 200
    assert response.json() == []
    assert captured and captured[0]["event"] == "evt-empty"
    assert captured[0]["clip_count"] == 0
    assert captured[0]["top_score"] is None


def test_top_shots_returns_ranked_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    clip_id = "clip-top"
    event_id = "evt-ranked"
    clips_repo.register_clip(
        {
            "id": clip_id,
            "event_id": event_id,
            "player_name": "Sky",
            "video_url": "https://cdn.example.com/clip.mp4",
            "thumbnail_url": "https://cdn.example.com/thumb.jpg",
            "created_at": "2024-01-01T12:00:00Z",
            "anchors": [2.0],
            "sg_delta": 0.45,
        }
    )

    def fake_list(event: str):
        assert event == event_id
        return [clips_repo.get_clip(clip_id)]

    def fake_rank(clips: list[dict[str, object]], *_args, **_kwargs):
        enriched = dict(clips[0])
        enriched["score"] = 5.5
        return [enriched]

    captured: list[dict[str, object]] = []

    monkeypatch.setattr(clips_repo, "list_for_event", fake_list)
    monkeypatch.setattr(ranking, "rank_top_shots", fake_rank)
    monkeypatch.setattr(
        clips_routes.telemetry_service,
        "emit_clip_rank_evaluated",
        lambda event_id, **payload: captured.append({"event": event_id, **payload}),
    )

    response = client.get(
        f"/events/{event_id}/top-shots",
        headers={"x-event-role": "admin"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    entry = payload[0]
    assert entry["id"] == clip_id
    assert entry["score"] == pytest.approx(5.5, rel=1e-6)
    assert entry["sgDelta"] == pytest.approx(0.45, rel=1e-6)
    assert captured and captured[0]["clip_count"] == 1
    assert captured[0]["top_score"] == pytest.approx(5.5, rel=1e-6)
