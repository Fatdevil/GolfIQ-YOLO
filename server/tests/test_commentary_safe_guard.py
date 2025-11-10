import importlib
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import clips_repo, commentary
from server.telemetry import events as telemetry_events

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    telemetry_events.set_events_telemetry_emitter(None)


@pytest.fixture
def repo(monkeypatch: pytest.MonkeyPatch):
    events_module = importlib.import_module("server.routes.events")
    repository = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repository)
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    return repository


@pytest.fixture
def telemetry_sink() -> list[tuple[str, dict[str, object]]]:
    captured: list[tuple[str, dict[str, object]]] = []

    def _emit(name: str, payload: dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def _prepare_clip(repo, clip_id: str) -> str:
    event = repo.create_event("AI Showcase", None, code="AI0001")
    event_id = event["id"]
    clips_repo.register_clip(
        {"id": clip_id, "event_id": event_id, "player_name": "Linn"}
    )
    return event_id


def test_commentary_request_blocked_when_safe(
    repo, monkeypatch: pytest.MonkeyPatch, telemetry_sink
) -> None:
    clip_id = str(uuid4())
    event_id = _prepare_clip(repo, clip_id)

    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(
        events_module,
        "_build_host_state",
        lambda event: SimpleNamespace(id=event, safe=True, tvFlags={"safe": True}),
    )
    monkeypatch.setattr(
        commentary,
        "generate_commentary",
        lambda _clip: pytest.fail("should not call commentary when safe"),
    )

    response = client.post(
        f"/events/clips/{clip_id}/commentary",
        headers={"x-event-role": "admin", "x-event-member": "member-1"},
    )

    assert response.status_code == 423
    detail = response.json().get("detail")
    assert detail["code"] == "TOURNAMENT_SAFE"
    assert "tournament-safe" in detail["message"].lower()

    assert ("clip.commentary.blocked_safe",) == tuple(
        name for name, _payload in telemetry_sink
    )
    payload = telemetry_sink[0][1]
    assert payload["eventId"] == event_id
    assert payload["clipId"] == clip_id
    assert payload.get("memberId") == "member-1"


def test_commentary_request_allowed_when_not_safe(
    repo, monkeypatch: pytest.MonkeyPatch, telemetry_sink
) -> None:
    clip_id = str(uuid4())
    _prepare_clip(repo, clip_id)

    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(
        events_module,
        "_build_host_state",
        lambda event: SimpleNamespace(id=event, safe=False),
    )

    monkeypatch.setattr(
        commentary,
        "generate_commentary",
        lambda _clip: commentary.CommentaryResult(
            clip_id=_clip,
            title="New highlight",
            summary="Updated clip summary",
            tts_url=None,
        ),
    )

    response = client.post(
        f"/events/clips/{clip_id}/commentary",
        headers={"x-event-role": "admin", "x-event-member": "member-9"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "New highlight"
    assert body["summary"] == "Updated clip summary"
    assert all(name != "clip.commentary.blocked_safe" for name, _ in telemetry_sink)
