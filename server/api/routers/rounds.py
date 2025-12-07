from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from server.api.security import require_api_key
from server.api.user_header import UserIdHeader
from server.club_distance import ClubDistanceService, get_club_distance_service
from server.rounds.club_distances import update_club_distances_from_round
from server.rounds.models import (
    FairwayResult,
    CaddieDecisionTelemetry,
    PuttDistanceBucket,
    Round,
    RoundInfo,
    RoundScores,
    RoundSummary,
    RoundSummaryWithRoundInfo,
    Shot,
    compute_round_category_stats,
    compute_round_summary,
)
from server.rounds.recap import RoundRecap, build_round_recap
from server.rounds.strokes_gained import compute_strokes_gained_for_round
from server.rounds.service import (
    RoundNotFound,
    RoundOwnershipError,
    RoundService,
    get_round_service,
)

router = APIRouter(
    prefix="/api/rounds", tags=["rounds"], dependencies=[Depends(require_api_key)]
)

logger = logging.getLogger(__name__)


def _derive_player_id(api_key: str | None, user_id: str | None) -> str:
    return user_id or api_key or "anonymous"


class StartRoundRequest(BaseModel):
    course_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("course_id", "courseId"),
        serialization_alias="courseId",
    )
    tee_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("tee_name", "teeName"),
        serialization_alias="teeName",
    )
    holes: int = 18
    start_hole: int = Field(
        default=1,
        validation_alias=AliasChoices("start_hole", "startHole"),
        serialization_alias="startHole",
        ge=1,
    )

    model_config = ConfigDict(populate_by_name=True)


class AppendShotRequest(BaseModel):
    hole_number: int = Field(
        serialization_alias="holeNumber",
        validation_alias=AliasChoices("hole_number", "holeNumber"),
    )
    club: str
    start_lat: float = Field(
        serialization_alias="startLat",
        validation_alias=AliasChoices("start_lat", "startLat"),
    )
    start_lon: float = Field(
        serialization_alias="startLon",
        validation_alias=AliasChoices("start_lon", "startLon"),
    )
    end_lat: float | None = Field(
        default=None,
        serialization_alias="endLat",
        validation_alias=AliasChoices("end_lat", "endLat"),
    )
    end_lon: float | None = Field(
        default=None,
        serialization_alias="endLon",
        validation_alias=AliasChoices("end_lon", "endLon"),
    )
    wind_speed_mps: float | None = Field(
        default=None,
        serialization_alias="windSpeedMps",
        validation_alias=AliasChoices("wind_speed_mps", "windSpeedMps"),
    )
    wind_direction_deg: float | None = Field(
        default=None,
        serialization_alias="windDirectionDeg",
        validation_alias=AliasChoices("wind_direction_deg", "windDirectionDeg"),
    )
    elevation_delta_m: float | None = Field(
        default=None,
        serialization_alias="elevationDeltaM",
        validation_alias=AliasChoices("elevation_delta_m", "elevationDeltaM"),
    )
    note: str | None = None
    tempo_backswing_ms: int | None = Field(
        default=None,
        serialization_alias="tempoBackswingMs",
        validation_alias=AliasChoices("tempo_backswing_ms", "tempoBackswingMs"),
    )
    tempo_downswing_ms: int | None = Field(
        default=None,
        serialization_alias="tempoDownswingMs",
        validation_alias=AliasChoices("tempo_downswing_ms", "tempoDownswingMs"),
    )
    tempo_ratio: float | None = Field(
        default=None,
        serialization_alias="tempoRatio",
        validation_alias=AliasChoices("tempo_ratio", "tempoRatio"),
    )

    model_config = ConfigDict(populate_by_name=True)


class UpdateHoleScoreRequest(BaseModel):
    par: int | None = None
    strokes: int | None = None
    putts: int | None = None
    penalties: int | None = None
    fairway_hit: bool | None = Field(
        default=None,
        serialization_alias="fairwayHit",
        validation_alias=AliasChoices("fairway_hit", "fairwayHit"),
    )
    fairway_result: FairwayResult | None = Field(
        default=None,
        serialization_alias="fairwayResult",
        validation_alias=AliasChoices("fairway_result", "fairwayResult"),
    )
    gir: bool | None = None
    first_putt_distance_bucket: PuttDistanceBucket | None = Field(
        default=None,
        serialization_alias="firstPuttDistanceBucket",
        validation_alias=AliasChoices(
            "first_putt_distance_bucket", "firstPuttDistanceBucket"
        ),
    )
    caddie_decision: CaddieDecisionTelemetry | None = Field(
        default=None,
        serialization_alias="caddieDecision",
        validation_alias=AliasChoices("caddie_decision", "caddieDecision"),
    )

    model_config = ConfigDict(populate_by_name=True)


class UpdateParsRequest(BaseModel):
    pars: dict[int, int]


class RoundStrokesGainedCategory(BaseModel):
    value: float
    label: str
    comment: str
    grade: str


class RoundStrokesGainedOut(BaseModel):
    round_id: str = Field(
        serialization_alias="roundId",
        validation_alias=AliasChoices("roundId", "round_id"),
    )
    total: float
    categories: dict[str, RoundStrokesGainedCategory]

    model_config = ConfigDict(populate_by_name=True)


@router.post("/start", response_model=Round)
def start_round(
    payload: StartRoundRequest,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> Round:
    player_id = _derive_player_id(api_key, user_id)
    try:
        active = service.get_active_round(player_id=player_id)
        if active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "round already in progress",
                    "activeRound": jsonable_encoder(active, by_alias=True),
                },
            )
        return service.start_round(
            player_id=player_id,
            course_id=payload.course_id,
            tee_name=payload.tee_name,
            holes=payload.holes or 18,
            start_hole=payload.start_hole or 1,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{round_id}/end", response_model=Round)
def end_round(
    round_id: str,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> Round:
    player_id = _derive_player_id(api_key, user_id)
    try:
        round_out = service.end_round(player_id=player_id, round_id=round_id)
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    try:
        update_club_distances_from_round(
            round_id=round_id, player_id=player_id, round_service=service
        )
    except Exception:
        logger.exception(
            "failed to update club distances for completed round",
            extra={"round_id": round_id, "player_id": player_id},
        )

    return round_out


@router.get("/{round_id}/recap", response_model=RoundRecap)
def get_round_recap(
    round_id: str,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundRecap:
    player_id = _derive_player_id(api_key, user_id)
    try:
        round_info = service.get_round_info(player_id=player_id, round_id=round_id)
        scores = service.get_scores(player_id=player_id, round_id=round_id)
        summary = compute_round_summary(scores)
        return build_round_recap(round_info, summary, scores)
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{round_id}/strokes-gained", response_model=RoundStrokesGainedOut)
def get_round_strokes_gained(
    round_id: str,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundStrokesGainedOut:
    player_id = _derive_player_id(api_key, user_id)
    try:
        scores = service.get_scores(player_id=player_id, round_id=round_id)
        summary = compute_round_summary(scores)
        category_stats = compute_round_category_stats(scores)
        result = compute_strokes_gained_for_round(summary, category_stats)
        return RoundStrokesGainedOut.model_validate(result)
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{round_id}/shots", response_model=Shot)
def append_shot(
    round_id: str,
    payload: AppendShotRequest,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
    club_distance: ClubDistanceService = Depends(get_club_distance_service),
) -> Shot:
    player_id = _derive_player_id(api_key, user_id)
    try:
        shot = service.append_shot(
            player_id=player_id,
            round_id=round_id,
            hole_number=payload.hole_number,
            club=payload.club,
            start_lat=payload.start_lat,
            start_lon=payload.start_lon,
            end_lat=payload.end_lat,
            end_lon=payload.end_lon,
            wind_speed_mps=payload.wind_speed_mps,
            wind_direction_deg=payload.wind_direction_deg,
            elevation_delta_m=payload.elevation_delta_m,
            note=payload.note,
            tempo_backswing_ms=payload.tempo_backswing_ms,
            tempo_downswing_ms=payload.tempo_downswing_ms,
            tempo_ratio=payload.tempo_ratio,
        )
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    club_distance.ingest_shot_from_round(shot)
    return shot


@router.get("/{round_id}/shots", response_model=list[Shot])
def list_round_shots(
    round_id: str,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> list[Shot]:
    player_id = _derive_player_id(api_key, user_id)
    try:
        return service.list_shots(player_id=player_id, round_id=round_id)
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{round_id}/scores", response_model=RoundScores)
def get_scorecard(
    round_id: str,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundScores:
    player_id = _derive_player_id(api_key, user_id)
    try:
        return service.get_scores(player_id=player_id, round_id=round_id)
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put("/{round_id}/scores/{hole_number}", response_model=RoundScores)
def upsert_hole_score(
    round_id: str,
    hole_number: int,
    payload: UpdateHoleScoreRequest,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundScores:
    player_id = _derive_player_id(api_key, user_id)
    try:
        updates = payload.model_dump(exclude_unset=True)
        return service.upsert_hole_score(
            player_id=player_id,
            round_id=round_id,
            hole_number=hole_number,
            updates=updates,
        )
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.put("/{round_id}/pars", response_model=RoundScores)
def update_pars(
    round_id: str,
    payload: UpdateParsRequest,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundScores:
    player_id = _derive_player_id(api_key, user_id)
    try:
        pars = {int(k): v for k, v in payload.pars.items()}
        return service.update_pars(player_id=player_id, round_id=round_id, pars=pars)
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/{round_id}/summary", response_model=RoundSummary)
def get_round_summary(
    round_id: str,
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundSummary:
    player_id = _derive_player_id(api_key, user_id)
    try:
        scores = service.get_scores(player_id=player_id, round_id=round_id)
        return compute_round_summary(scores)
    except RoundNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="round not found"
        )
    except RoundOwnershipError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="round not owned by player"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/current", response_model=RoundInfo | None)
def get_current_round(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundInfo | None:
    player_id = _derive_player_id(api_key, user_id)
    try:
        return service.get_active_round(player_id=player_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/latest", response_model=RoundSummaryWithRoundInfo | None)
def get_latest_completed_round(
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> RoundSummaryWithRoundInfo | None:
    if not api_key and not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )
    player_id = _derive_player_id(api_key, user_id)
    try:
        return service.get_latest_completed_summary(player_id=player_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/summaries", response_model=list[RoundSummary])
def list_round_summaries(
    limit: int = Query(20, ge=1, le=200),
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> list[RoundSummary]:
    player_id = _derive_player_id(api_key, user_id)
    try:
        return service.get_round_summaries(player_id=player_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=list[RoundInfo])
def list_rounds(
    limit: int = Query(20, ge=1, le=200),
    api_key: str | None = Depends(require_api_key),
    user_id: UserIdHeader = None,
    service: RoundService = Depends(get_round_service),
) -> list[RoundInfo]:
    player_id = _derive_player_id(api_key, user_id)
    try:
        return service.list_rounds(player_id=player_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


__all__ = ["router"]
