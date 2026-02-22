from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from server.app import app
from server.services.session_service import (
    record_hit,
    reset_sessions,
    start_session,
)


API_KEY = "test-key"


def _setup(monkeypatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", API_KEY)
    monkeypatch.delenv("GOLFIQ_PRO_API_KEYS", raising=False)
    reset_sessions()


def _seed_sessions() -> tuple[str, str]:
    base_time = datetime(2025, 1, 1, tzinfo=timezone.utc)
    first = start_session("user-a", session_id="s-1", started_at=base_time)
    second = start_session(
        "user-a", session_id="s-2", started_at=base_time + timedelta(hours=1)
    )
    other = start_session("user-b", session_id="s-3", started_at=base_time)

    record_hit(first.session_id, on_target=True)
    record_hit(first.session_id, on_target=False)
    record_hit(second.session_id, on_target=True)
    record_hit(other.session_id, on_target=True)

    return first.session_id, second.session_id


def test_list_sessions_for_user(monkeypatch):
    _setup(monkeypatch)
    first_id, second_id = _seed_sessions()

    with TestClient(app) as client:
        resp = client.get(
            "/session/list",
            params={"user_id": "user-a"},
            headers={"x-api-key": API_KEY},
        )

        assert resp.status_code == 200
        items = resp.json()
        assert [item["session_id"] for item in items] == [second_id, first_id]
        assert items[0]["total_shots"] == 1
        assert items[0]["on_target_shots"] == 1
        assert items[0]["on_target_percent"] == 100.0
        assert items[1]["total_shots"] == 2
        assert items[1]["on_target_shots"] == 1
        assert items[1]["on_target_percent"] == 50.0


def test_list_sessions_requires_user_id(monkeypatch):
    _setup(monkeypatch)
    _seed_sessions()

    with TestClient(app) as client:
        resp = client.get("/session/list", headers={"x-api-key": API_KEY})

        assert resp.status_code == 400
        assert resp.json()["detail"] == "user_id_required"


def test_get_session_summary(monkeypatch):
    _setup(monkeypatch)
    first_id, _ = _seed_sessions()

    with TestClient(app) as client:
        resp = client.get(
            f"/session/{first_id}/summary", headers={"x-api-key": API_KEY}
        )

        assert resp.status_code == 200
        summary = resp.json()
        assert summary["session_id"] == first_id
        assert summary["total_shots"] == 2
        assert summary["on_target_shots"] == 1
