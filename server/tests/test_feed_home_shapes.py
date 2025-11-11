from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import feed as feed_routes
from server.services import clips_repo, live_stream
from server.telemetry import events as telemetry_events


client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    live_stream.reset()
    feed_routes.reset_cache_for_tests()
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    telemetry_events.set_events_telemetry_emitter(None)


def _seed_clip(
    clip_id: str, *, sg: float, reactions_1m: int, reactions_total: int, created: str
) -> None:
    clips_repo.register_clip(
        {
            "id": clip_id,
            "event_id": "evt-home",
            "sg_delta": sg,
            "reactions_1min": reactions_1m,
            "reactions_total": reactions_total,
            "anchors": [8.0],
            "created_at": created,
        }
    )


def test_feed_home_shapes(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2024, 1, 2, 12, 30, tzinfo=timezone.utc)
    fake_time = SimpleNamespace(time=lambda: 1_700_000_000.0)
    monkeypatch.setattr(feed_routes, "_now", lambda: now)
    monkeypatch.setattr(feed_routes, "time", fake_time)

    _seed_clip(
        "clip-a",
        sg=0.62,
        reactions_1m=3,
        reactions_total=17,
        created="2024-01-02T12:00:00Z",
    )
    _seed_clip(
        "clip-b",
        sg=0.41,
        reactions_1m=2,
        reactions_total=9,
        created="2024-01-02T11:50:00Z",
    )
    _seed_clip(
        "clip-c",
        sg=0.05,
        reactions_1m=1,
        reactions_total=5,
        created="2024-01-02T11:40:00Z",
    )

    captured: list[tuple[str, dict[str, object]]] = []
    telemetry_events.set_events_telemetry_emitter(
        lambda name, payload: captured.append((name, dict(payload)))
    )

    response = client.get("/feed/home", params={"limit": 3})
    assert response.status_code == 200

    payload = response.json()
    assert payload["updatedAt"] == "2024-01-02T12:30:00Z"
    etag_header = response.headers["etag"]
    assert etag_header.startswith('"') and etag_header.endswith('"')
    rep_etag = etag_header.strip('"')
    snapshot_etag, _, limit_token = rep_etag.partition(";limit=")
    assert payload["etag"] == snapshot_etag
    assert limit_token == "5"

    top_shots = payload["topShots"]
    assert isinstance(top_shots, list) and len(top_shots) == 3
    assert top_shots[0]["clipId"] == "clip-a"
    assert (
        top_shots[0]["rankScore"]
        >= top_shots[1]["rankScore"]
        >= top_shots[2]["rankScore"]
    )
    assert top_shots[0]["anchorSec"] == pytest.approx(8.0, rel=1e-6)
    assert top_shots[0]["reactions1min"] == 3
    assert top_shots[0]["reactionsTotal"] == 17

    assert isinstance(payload["live"], list)

    requested = [event for event in captured if event[0] == "feed.home.requested"]
    served = [event for event in captured if event[0] == "feed.home.served"]
    assert requested and requested[0][1]["limit"] == 5  # clamp to min bound
    assert served and served[0][1]["topCount"] == 3


def test_feed_home_limit_clamp(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2024, 1, 3, 9, 0, tzinfo=timezone.utc)
    fake_time = SimpleNamespace(time=lambda: 1_700_000_500.0)
    monkeypatch.setattr(feed_routes, "_now", lambda: now)
    monkeypatch.setattr(feed_routes, "time", fake_time)

    for idx in range(60):
        _seed_clip(
            f"clip-{idx}",
            sg=0.2 + idx * 0.01,
            reactions_1m=idx,
            reactions_total=idx * 3,
            created="2024-01-03T08:00:00Z",
        )

    response = client.get("/feed/home", params={"limit": 200})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["topShots"]) == 50
