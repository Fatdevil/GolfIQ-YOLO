from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.routes import moderation as mod

client = TestClient(app, raise_server_exceptions=False)


def test_telemetry_emits_on_report(monkeypatch):
    emitted: list[tuple[str, str]] = []

    def fake_emit_clip_reported(
        clip_id: str, *, reason: str, reporter: str | None = None
    ) -> None:
        emitted.append((clip_id, reason))

    def fake_record_report(clip_id: str, *, reason: str, details=None, reporter=None):
        return {
            "id": "r1",
            "clipId": clip_id,
            "ts": 1731,
            "reason": reason,
            "status": "open",
        }

    monkeypatch.setattr(
        mod.telemetry_service,
        "emit_clip_reported",
        fake_emit_clip_reported,
        raising=True,
    )
    monkeypatch.setattr(
        mod.moderation_repo,
        "record_report",
        fake_record_report,
        raising=True,
    )

    response = client.post("/clips/clipY/report", json={"reason": "spam"})
    assert response.status_code in (200, 201)
    assert ("clipY", "spam") in emitted
