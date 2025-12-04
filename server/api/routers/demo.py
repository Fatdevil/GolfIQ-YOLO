from fastapi import APIRouter

from server.api.routers.summary import WeeklySummary
from server.demo.demo_data import (
    build_demo_coach_round,
    build_demo_round_recap,
    build_demo_weekly_summary,
)
from server.rounds.recap import RoundRecap
from server.schemas.coach_summary import CoachRoundSummary
from server.services.demo_profile import DemoProfileResponse, build_demo_profile

router = APIRouter()


@router.get("/api/demo/profile", response_model=DemoProfileResponse)
def get_demo_profile() -> DemoProfileResponse:
    """Return a synthetic demo profile and analytics bundle."""

    return build_demo_profile()


@router.get("/api/demo/round", response_model=RoundRecap)
def get_demo_round() -> RoundRecap:
    """Return a fixed round recap payload for demo and onboarding."""

    return build_demo_round_recap()


@router.get("/api/demo/weekly", response_model=WeeklySummary)
def get_demo_weekly() -> WeeklySummary:
    """Return a weekly summary snapshot for demo users."""

    return build_demo_weekly_summary()


@router.get("/api/demo/coach/round", response_model=CoachRoundSummary)
def get_demo_coach_round() -> CoachRoundSummary:
    """Return a coach round summary for demo mode without requiring Pro."""

    return build_demo_coach_round()


__all__ = ["router"]
