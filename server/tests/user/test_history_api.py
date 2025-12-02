from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.user.history_service import reset_history_store


API_KEY = "test-key"


def _setup(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", API_KEY)
    monkeypatch.delenv("GOLFIQ_PRO_API_KEYS", raising=False)
    reset_history_store()


def test_user_history_requires_user_id(monkeypatch):
    _setup(monkeypatch)
    with TestClient(app) as client:
        resp = client.get(
            "/api/user/history/quickrounds",
            headers={"x-api-key": API_KEY},
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "user_id_required"


def test_quickround_history_round_trip(monkeypatch):
    _setup(monkeypatch)
    payload = [
        {
            "id": "qr-1",
            "started_at": "2024-01-01T00:00:00Z",
            "total_strokes": 72,
        }
    ]
    with TestClient(app) as client:
        created = client.post(
            "/api/user/history/quickrounds",
            json=payload,
            headers={"x-api-key": API_KEY, "x-user-id": "u-demo"},
        )
        assert created.status_code == 200
        data = created.json()
        assert data["user_id"] == "u-demo"
        assert len(data["quickrounds"]) == 1

        listed = client.get(
            "/api/user/history/quickrounds",
            headers={"x-api-key": API_KEY, "x-user-id": "u-demo"},
        )
        assert listed.status_code == 200
        items = listed.json()
        assert items
        assert any(item["id"] == "qr-1" for item in items)


def test_range_session_history_round_trip(monkeypatch):
    _setup(monkeypatch)
    payload = [
        {
            "id": "rs-1",
            "started_at": "2024-02-01T00:00:00Z",
            "ended_at": "2024-02-01T00:10:00Z",
            "shot_count": 25,
            "avg_tempo_backswing_ms": 900,
            "avg_tempo_downswing_ms": 310,
            "avg_tempo_ratio": 2.9,
            "tempo_sample_count": 12,
        }
    ]
    with TestClient(app) as client:
        created = client.post(
            "/api/user/history/rangesessions",
            json=payload,
            headers={"x-api-key": API_KEY, "x-user-id": "u-range"},
        )
        assert created.status_code == 200
        data = created.json()
        assert data["user_id"] == "u-range"
        assert len(data["range_sessions"]) == 1

        listed = client.get(
            "/api/user/history/rangesessions",
            headers={"x-api-key": API_KEY, "x-user-id": "u-range"},
        )
        assert listed.status_code == 200
        items = listed.json()
        assert items
        assert any(item["id"] == "rs-1" for item in items)
        assert items[0]["avgTempoBackswingMs"] == 900
        assert items[0]["avgTempoDownswingMs"] == 310
        assert items[0]["avgTempoRatio"] == 2.9
        assert items[0]["tempoSampleCount"] == 12
