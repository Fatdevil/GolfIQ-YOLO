from __future__ import annotations

import asyncio
import json
import time
from queue import Empty
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from server.security import require_api_key
from server.services.watch_tip_bus import Tip, publish, subscribe, unsubscribe

PING_INTERVAL_SECONDS = 15.0
POLL_INTERVAL_SECONDS = 0.25

router = APIRouter(dependencies=[Depends(require_api_key)])


class TipIn(BaseModel):
    tipId: str
    title: str
    body: str
    club: str | None = None
    playsLike_m: float | None = None
    shotRef: dict | None = None

    def to_tip(self) -> Tip:
        return Tip(**self.model_dump())


@router.post("/api/watch/{member_id}/tips")
def post_tip(member_id: str, body: TipIn):
    tip = publish(member_id, body.to_tip())
    return {"status": "ok", "tip": tip.to_dict()}


async def _tip_stream(member_id: str, request: Request) -> AsyncIterator[str]:
    queue = subscribe(member_id)
    last_ping = time.time()
    try:
        yield ":ok\n\n"
        while True:
            if await request.is_disconnected():
                break

            now = time.time()
            if now - last_ping >= PING_INTERVAL_SECONDS:
                last_ping = now
                yield "event: ping\ndata: {}\n\n"

            try:
                tip = queue.get_nowait()
            except Empty:
                tip = None

            if tip is not None:
                yield f"event: tip\ndata: {json.dumps(tip.to_dict())}\n\n"
                continue

            await asyncio.sleep(POLL_INTERVAL_SECONDS)
    finally:
        unsubscribe(member_id, queue)


@router.get("/api/watch/{member_id}/tips/stream")
async def stream_tips(member_id: str, request: Request) -> StreamingResponse:
    generator = _tip_stream(member_id, request)
    headers = {"Cache-Control": "no-cache", "Connection": "keep-alive"}
    return StreamingResponse(generator, media_type="text/event-stream", headers=headers)
