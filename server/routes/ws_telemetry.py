from __future__ import annotations

import logging
import os
from collections import defaultdict
from contextlib import nullcontext
from typing import Dict, List, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from server.schemas.telemetry import TelemetrySample

logger = logging.getLogger(__name__)

router = APIRouter()

_telemetry_ws_hub: Dict[str, Set[WebSocket]] = defaultdict(set)

_OTEL_ENABLED = os.getenv("OPENTELEMETRY_ENABLED") == "1"
_tracer = None
if _OTEL_ENABLED:
    try:
        from opentelemetry import trace  # type: ignore
    except ImportError:  # pragma: no cover - optional dependency
        trace = None  # type: ignore
    if "trace" in locals() and trace is not None:  # pragma: no branch
        _tracer = trace.get_tracer(__name__)


async def _broadcast_to_clients(sample: TelemetrySample) -> int:
    clients = _telemetry_ws_hub.get(sample.session_id)
    if not clients:
        return 0

    if hasattr(sample, "model_dump"):
        payload = sample.model_dump(exclude_none=True)
    else:
        payload = sample.dict(exclude_none=True)
    delivered = 0
    to_remove: Set[WebSocket] = set()

    span_cm = (
        _tracer.start_as_current_span("ws.broadcast") if _tracer else nullcontext()
    )

    with span_cm:
        for websocket in list(clients):
            try:
                await websocket.send_json(payload)
                delivered += 1
            except Exception:
                to_remove.add(websocket)

    for websocket in to_remove:
        clients.discard(websocket)

    if not clients:
        _telemetry_ws_hub.pop(sample.session_id, None)

    return delivered


@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket) -> None:
    session_id = websocket.query_params.get("session_id")
    if not session_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    _telemetry_ws_hub[session_id].add(websocket)
    logger.info("telemetry websocket connected", extra={"session_id": session_id})

    await websocket.send_json({"type": "hello", "session_id": session_id})

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        clients = _telemetry_ws_hub.get(session_id)
        if clients and websocket in clients:
            clients.discard(websocket)
            if not clients:
                _telemetry_ws_hub.pop(session_id, None)
        logger.info(
            "telemetry websocket disconnected", extra={"session_id": session_id}
        )


@router.post("/telemetry/batch", status_code=status.HTTP_202_ACCEPTED)
async def ingest_telemetry_batch(samples: List[TelemetrySample]) -> Dict[str, int]:
    delivered = 0
    for sample in samples:
        delivered += await _broadcast_to_clients(sample)

    accepted = len(samples)
    logger.info(
        "telemetry batch delivered",
        extra={"accepted": accepted, "delivered": delivered},
    )
    return {"accepted": accepted, "delivered": delivered}
