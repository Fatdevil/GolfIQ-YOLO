from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict

import pytest
from fastapi import WebSocketDisconnect

from server.routes import ws_telemetry
from server.schemas.telemetry import Telemetry, TelemetrySample


class _StubWebSocket:
    def __init__(self, *, fail: bool = False) -> None:
        self.accepted = False
        self.sent: list[Dict[str, Any]] = []
        self._fail = fail

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: Dict[str, Any]) -> None:
        if self._fail:
            raise RuntimeError("boom")
        self.sent.append(message)

    async def receive_text(self) -> str:
        raise WebSocketDisconnect()


def test_connection_manager_broadcast_handles_failures() -> None:
    async def _run() -> None:
        manager = ws_telemetry.ConnectionManager()
        ok = _StubWebSocket()
        failing = _StubWebSocket(fail=True)
        await manager.connect(ok)
        await manager.connect(failing)

        delivered = await manager.broadcast({"hello": "world"})

        assert delivered == 1
        assert ok.sent == [{"hello": "world"}]
        assert failing not in manager._connections

    asyncio.run(_run())


def test_dump_model_excludes_missing_optionals() -> None:
    telemetry = Telemetry(timestampMs=1, club="driver")
    dumped = ws_telemetry._dump_model(telemetry)
    assert "club" in dumped
    assert "event" not in dumped

    telemetry_with_event = Telemetry(timestampMs=2, event="round")
    dumped_with_event = ws_telemetry._dump_model(telemetry_with_event)
    assert dumped_with_event["event"] == "round"


def test_flight_recorder_pct_and_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "12.5")
    assert ws_telemetry._flight_recorder_pct() == pytest.approx(12.5)

    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "not-a-number")
    assert ws_telemetry._flight_recorder_pct() == pytest.approx(5.0)

    monkeypatch.setenv("FLIGHT_RECORDER_DIR", "/tmp/flight-test")
    assert ws_telemetry._flight_recorder_dir() == Path("/tmp/flight-test")

    monkeypatch.delenv("FLIGHT_RECORDER_DIR", raising=False)
    assert ws_telemetry._flight_recorder_dir() == ws_telemetry._DEFAULT_FLIGHT_DIR


def test_telemetry_ws_connects_and_disconnects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _run() -> None:
        manager = ws_telemetry.ConnectionManager()
        monkeypatch.setattr(ws_telemetry, "manager", manager)
        socket = _StubWebSocket()

        await ws_telemetry.telemetry_ws(socket)

        assert socket.accepted
        assert not manager._connections

    asyncio.run(_run())


def test_publish_telemetry_records_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _run() -> None:
        manager = ws_telemetry.ConnectionManager()
        monkeypatch.setattr(ws_telemetry, "manager", manager)

        async def _fake_broadcast(message: Dict[str, Any]) -> int:
            return 3

        monkeypatch.setattr(manager, "broadcast", _fake_broadcast)
        monkeypatch.setattr(ws_telemetry, "should_record", lambda pct: True)
        monkeypatch.setattr(ws_telemetry, "_flight_recorder_pct", lambda: 42.0)
        monkeypatch.setattr(
            ws_telemetry, "_flight_recorder_dir", lambda: Path("/tmp/flight")
        )

        recorded: dict[str, tuple[Dict[str, Any], Path]] = {}

        def _capture(message: Dict[str, Any], directory: Path) -> None:
            recorded["call"] = (message, directory)

        monkeypatch.setattr(ws_telemetry, "record", _capture)

        payload = Telemetry(timestampMs=99, event="clip", latencyMs=12.3)
        result = await ws_telemetry.publish_telemetry(payload)

        assert result == {"accepted": 1, "delivered": 3, "recorded": True}
        assert recorded["call"][0]["event"] == "clip"
        assert recorded["call"][1] == Path("/tmp/flight")

    asyncio.run(_run())


def test_publish_telemetry_skips_record_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _run() -> None:
        manager = ws_telemetry.ConnectionManager()
        monkeypatch.setattr(ws_telemetry, "manager", manager)

        async def _fake_broadcast(message: Dict[str, Any]) -> int:
            return 0

        monkeypatch.setattr(manager, "broadcast", _fake_broadcast)
        monkeypatch.setattr(ws_telemetry, "should_record", lambda pct: False)
        monkeypatch.setattr(ws_telemetry, "_flight_recorder_pct", lambda: 1.0)
        monkeypatch.setattr(
            ws_telemetry, "_flight_recorder_dir", lambda: Path("/tmp/flight")
        )

        captured = {}
        monkeypatch.setattr(
            ws_telemetry, "record", lambda *a, **k: captured.setdefault("called", True)
        )

        payload = Telemetry(timestampMs=42)
        result = await ws_telemetry.publish_telemetry(payload)

        assert result == {"accepted": 1, "delivered": 0, "recorded": False}
        assert "called" not in captured

    asyncio.run(_run())


def test_ingest_telemetry_batch_counts_samples() -> None:
    async def _run() -> None:
        samples = [TelemetrySample(session_id="s1", ts=1.23)]
        result = await ws_telemetry.ingest_telemetry_batch(samples)
        assert result == {"accepted": 1, "delivered": 0}

    asyncio.run(_run())
