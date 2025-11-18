from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Set

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from fastapi import HTTPException
from pydantic import BaseModel

from server.flight_recorder import record, should_record
from server.security import require_api_key
from server.schemas.telemetry import Telemetry, TelemetrySample

router = APIRouter(dependencies=[Depends(require_api_key)])


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def broadcast(self, message: Dict[str, object]) -> int:
        delivered = 0
        to_remove: Set[WebSocket] = set()

        for websocket in list(self._connections):
            try:
                await websocket.send_json(message)
                delivered += 1
            except Exception:
                to_remove.add(websocket)

        for websocket in to_remove:
            self.disconnect(websocket)

        return delivered

    def __len__(self) -> int:  # pragma: no cover - convenience helper
        return len(self._connections)


manager = ConnectionManager()

_DEFAULT_FLIGHT_DIR = Path(__file__).resolve().parents[1] / "var" / "flight"


def _dump_model(model: Telemetry) -> Dict[str, object]:
    dumper = getattr(model, "model_dump", None)
    if callable(dumper):
        data = dumper(by_alias=True, exclude_none=False)
        fields_set = set(getattr(model, "model_fields_set", set()))
    else:
        data = model.dict(by_alias=True, exclude_none=False)  # type: ignore[call-arg]
        fields_set = set(getattr(model, "__fields_set__", set()))

    optional_keys = {
        "event",
        "configHash",
        "runtime",
        "device",
        "latencyMs",
        "feedback",
        "playsLike",
    }
    for key in optional_keys:
        if key not in fields_set and data.get(key) is None:
            data.pop(key, None)

    return data


def _flight_recorder_pct() -> float:
    value = os.getenv("FLIGHT_RECORDER_PCT", "5.0")
    try:
        return float(value)
    except ValueError:
        return 5.0


def _flight_recorder_dir() -> Path:
    override = os.getenv("FLIGHT_RECORDER_DIR")
    if override:
        return Path(override)
    return _DEFAULT_FLIGHT_DIR


def _authorize_websocket(websocket: WebSocket) -> bool:
    try:
        require_api_key(
            x_api_key=websocket.headers.get("x-api-key"),
            api_key_query=websocket.query_params.get("apiKey"),
        )
        return True
    except HTTPException:
        return False


@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket) -> None:
    if not _authorize_websocket(websocket):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)


@router.post("/telemetry")
async def publish_telemetry(payload: Telemetry) -> Dict[str, object]:
    return await dispatch_telemetry(payload)


@router.post("/telemetry/batch", status_code=202)
async def ingest_telemetry_batch(samples: List[TelemetrySample]) -> Dict[str, int]:
    return {"accepted": len(samples), "delivered": 0}


async def dispatch_telemetry(model: BaseModel) -> Dict[str, object]:
    """Broadcast a telemetry model and optionally record it to disk."""

    message = _dump_model(model)
    delivered = await manager.broadcast(message)

    recorded = False
    if should_record(_flight_recorder_pct()):
        record(message, _flight_recorder_dir())
        recorded = True

    return {"accepted": 1, "delivered": delivered, "recorded": recorded}
