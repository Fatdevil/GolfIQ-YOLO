from __future__ import annotations

from pathlib import Path

import anyio
import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import ws_telemetry


class _LegacyTelemetry:
    __fields_set__ = {"runtime"}

    def __init__(self) -> None:
        self.runtime = None

    def dict(self, **kwargs: object) -> dict[str, object]:
        return {
            "runtime": self.runtime,
            "event": None,
            "extra": 123,
            "playsLike": None,
        }


class _DumpableTelemetry:
    def __init__(self) -> None:
        self.model_fields_set = {"feedback"}

    def model_dump(self, **kwargs: object) -> dict[str, object]:
        return {
            "event": None,
            "feedback": None,
            "configHash": "abc",
            "device": {"model": "Pro"},
        }


def test_ws_connect_and_disconnect() -> None:
    client = TestClient(app)

    with client.websocket_connect("/ws/telemetry") as websocket:
        websocket.send_text("ping")

    assert len(ws_telemetry.manager) == 0


def test_broadcast_drops_failed_clients() -> None:
    class FailingWebSocket:
        def __hash__(self) -> int:  # pragma: no cover - deterministic hash for set
            return id(self)

        async def send_json(self, payload: object) -> None:  # pragma: no cover
            raise RuntimeError("boom")

    failing_ws = FailingWebSocket()
    ws_telemetry.manager._connections.add(failing_ws)  # type: ignore[attr-defined]

    try:
        delivered = anyio.run(ws_telemetry.manager.broadcast, {"ok": True})
    finally:
        ws_telemetry.manager._connections.discard(failing_ws)  # type: ignore[attr-defined]

    assert delivered == 0
    assert len(ws_telemetry.manager) == 0


def test_broadcast_success_path() -> None:
    class CapturingWebSocket:
        def __init__(self) -> None:
            self.sent: list[object] = []

        def __hash__(self) -> int:  # pragma: no cover - stable hashing
            return id(self)

        async def send_json(self, payload: object) -> None:
            self.sent.append(payload)

    websocket = CapturingWebSocket()
    ws_telemetry.manager._connections.add(websocket)  # type: ignore[attr-defined]

    try:
        delivered = anyio.run(ws_telemetry.manager.broadcast, {"ok": True})
    finally:
        ws_telemetry.manager._connections.discard(websocket)  # type: ignore[attr-defined]

    assert delivered == 1
    assert websocket.sent == [{"ok": True}]


def test_dump_model_prefers_model_dump_path() -> None:
    payload = ws_telemetry._dump_model(_DumpableTelemetry())

    assert "event" not in payload
    assert payload["feedback"] is None
    assert payload["configHash"] == "abc"
    assert payload["device"] == {"model": "Pro"}


def test_dump_model_legacy_dict_path() -> None:
    payload = ws_telemetry._dump_model(_LegacyTelemetry())

    assert payload["runtime"] is None
    assert "event" not in payload
    assert "playsLike" not in payload
    assert payload["extra"] == 123


def test_flight_recorder_pct(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "12.5")
    assert ws_telemetry._flight_recorder_pct() == 12.5

    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "not-a-number")
    assert ws_telemetry._flight_recorder_pct() == 5.0


def test_flight_recorder_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))
    assert ws_telemetry._flight_recorder_dir() == tmp_path

    monkeypatch.delenv("FLIGHT_RECORDER_DIR", raising=False)
    assert ws_telemetry._flight_recorder_dir() == ws_telemetry._DEFAULT_FLIGHT_DIR


def test_publish_telemetry_records_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    async def fake_broadcast(message: dict[str, object]) -> int:
        calls.append(message)
        return 2

    monkeypatch.setattr(ws_telemetry.manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(ws_telemetry, "should_record", lambda pct: True)

    recorded: list[tuple[dict[str, object], Path]] = []

    def fake_record(message: dict[str, object], path: Path) -> None:
        recorded.append((message, path))

    monkeypatch.setattr(ws_telemetry, "record", fake_record)
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", "/tmp/telemetry")

    class Payload:
        model_fields_set = set()

        def model_dump(self, **kwargs: object) -> dict[str, object]:
            return {"event": "evt-1", "configHash": "xyz"}

    result = anyio.run(ws_telemetry.publish_telemetry, Payload())

    assert result == {"accepted": 1, "delivered": 2, "recorded": True}
    assert calls == [{"event": "evt-1", "configHash": "xyz"}]
    assert recorded[0][0] == {"event": "evt-1", "configHash": "xyz"}
    assert recorded[0][1] == Path("/tmp/telemetry")


def test_publish_telemetry_skips_recording(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_broadcast(message: dict[str, object]) -> int:
        return 0

    monkeypatch.setattr(ws_telemetry.manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(ws_telemetry, "should_record", lambda pct: False)

    class Payload:
        model_fields_set = set()

        def model_dump(self, **kwargs: object) -> dict[str, object]:
            return {"event": "evt-2"}

    result = anyio.run(ws_telemetry.publish_telemetry, Payload())

    assert result == {"accepted": 1, "delivered": 0, "recorded": False}
