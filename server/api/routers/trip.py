from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from server.api.security import require_api_key
from server.trip.models import TripHoleScore, TripPlayer, TripRound
from server.trip.store import (
    create_trip_round,
    get_trip_by_token,
    get_trip_round,
    issue_public_token,
    upsert_scores,
)

router = APIRouter(
    prefix="/api/trip",
    tags=["trip"],
    dependencies=[Depends(require_api_key)],
)

public_router = APIRouter(
    prefix="/public/trip",
    tags=["trip-public"],
)


class TripCreateIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    course_name: str = Field(..., alias="courseName")
    course_id: str | None = Field(default=None, alias="courseId")
    tees_name: str | None = Field(default=None, alias="teesName")
    holes: int
    players: List[str]


class TripCreateOut(TripRound):
    pass


@router.post("/rounds", response_model=TripCreateOut)
def create_round(payload: TripCreateIn):
    if payload.holes <= 0 or payload.holes > 36:
        raise HTTPException(status_code=400, detail="invalid_holes")

    players = [
        TripPlayer(id=f"p{i+1}", name=name.strip())
        for i, name in enumerate(payload.players)
        if name.strip()
    ]
    if not players:
        raise HTTPException(status_code=400, detail="no_players")

    trip = create_trip_round(
        course_name=payload.course_name,
        holes=payload.holes,
        players=players,
        course_id=payload.course_id,
        tees_name=payload.tees_name,
    )
    return trip


@router.get("/rounds/{trip_id}", response_model=TripRound)
def get_round(trip_id: str):
    trip = get_trip_round(trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="trip_not_found")
    return trip


class TripScoresIn(BaseModel):
    scores: List[TripHoleScore]


@router.post("/rounds/{trip_id}/scores", response_model=TripRound)
def post_scores(trip_id: str, payload: TripScoresIn):
    try:
        trip = upsert_scores(trip_id, payload.scores)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid_score_entries")
    if not trip:
        raise HTTPException(status_code=404, detail="trip_not_found")
    return trip


class TripShareOut(BaseModel):
    publicToken: str


@router.post("/rounds/{trip_id}/share", response_model=TripShareOut)
def create_share_token(trip_id: str):
    token = issue_public_token(trip_id)
    if not token:
        raise HTTPException(status_code=404, detail="trip_not_found")
    return TripShareOut(publicToken=token)


class PublicTripRound(BaseModel):
    course_name: str
    tees_name: Optional[str]
    holes: int
    created_ts: float
    players: List[TripPlayer]
    scores: List[TripHoleScore]


@public_router.get("/rounds/{token}", response_model=PublicTripRound)
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
