from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from server.trip.events import subscribe, unsubscribe
from server.trip.models import TripHoleScore, TripPlayer
from server.trip.store import get_trip_by_token

router = APIRouter(
    prefix="/public/trip",
    tags=["trip-public"],
)


class PublicTripRound(BaseModel):
    course_name: str
    tees_name: Optional[str]
    holes: int
    created_ts: float
    players: list[TripPlayer]
    scores: list[TripHoleScore]


@router.get("/rounds/{token}", response_model=PublicTripRound)
def get_public_trip_round(token: str):
    trip = get_trip_by_token(token)
    if not trip:
        raise HTTPException(status_code=404, detail="trip_not_found")

    return PublicTripRound(
        course_name=trip.course_name,
        tees_name=trip.tees_name,
        holes=trip.holes,
        created_ts=trip.created_ts,
        players=trip.players,
        scores=trip.scores,
    )


def _public_payload(data: dict) -> dict:
    allowed = {
        "course_name",
        "tees_name",
        "holes",
        "created_ts",
        "players",
        "scores",
    }
    return {key: data.get(key) for key in allowed}


@router.get("/rounds/{token}/stream")
async def stream_trip_public(token: str) -> StreamingResponse:
    trip = get_trip_by_token(token)
    if not trip:
        raise HTTPException(status_code=404, detail="trip_not_found")

    async def event_generator():
        queue: "asyncio.Queue[dict]" = asyncio.Queue()

        def callback(data: dict) -> None:
            queue.put_nowait(_public_payload(data))

        subscribe(trip.id, callback)

        try:
            yield f"data: {json.dumps(_public_payload(trip.model_dump()))}\n\n".encode("utf-8")
            while True:
                payload = await queue.get()
                yield f"data: {json.dumps(payload)}\n\n".encode("utf-8")
        finally:
            unsubscribe(trip.id, callback)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
