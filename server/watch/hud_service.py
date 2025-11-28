"""Helpers to build watch HUD payloads from existing services."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from server.access.config import lookup_plan_for_key
from server.access.models import PlanName
from server.bundles.models import CourseBundle as HeroCourseBundle
from server.bundles.storage import get_bundle as get_hero_bundle
from server.caddie.advise import advise
from server.caddie.schemas import AdviseIn, EnvIn, PlayerBag, ShotContext
from server.courses.hole_detect import haversine_m, suggest_hole
from server.courses.schemas import CourseBundle as LegacyCourseBundle
from server.courses.schemas import GeoPoint, HoleBundle
from server.courses.store import get_course_bundle
from server.services.hole_detect import SuggestedHole, suggest_hole_for_location
from server.services.watch_tip_bus import get_latest_tip_for_member
from server.storage.runs import load_run
from server.watch.hud_schemas import HoleHud, HudTip

DEFAULT_BAG_CARRIES_M: Dict[str, float] = {
    "pw": 120.0,
    "9i": 135.0,
    "8i": 150.0,
    "7i": 160.0,
    "6i": 170.0,
    "5i": 185.0,
    "4i": 195.0,
    "3h": 205.0,
    "5w": 215.0,
    "3w": 230.0,
}

# Suggestions below this confidence are treated as too weak to override the requested
# hole when auto-detect is enabled.
AUTO_DETECT_MIN_CONFIDENCE = 0.2


def _resolve_plan(*, api_key: Optional[str], override: Optional[PlanName]) -> PlanName:
    """Return the active plan for the request, defaulting to config."""

    if override:
        return override
    return lookup_plan_for_key(api_key)


@dataclass
class _RunContext:
    event_id: Optional[str] = None
    course_id: Optional[str] = None
    tournament_safe: bool = False
    shots_taken: int = 0
    sg_delta_total: Optional[float] = None
    sg_delta_last: Optional[float] = None


def _load_run_context(run_id: str) -> _RunContext:
    run = load_run(run_id)
    if not run:
        return _RunContext()

    params = getattr(run, "params", {}) or {}
    metrics = getattr(run, "metrics", {}) or {}

    event_id = params.get("eventId") or params.get("event_id")
    course_id = params.get("courseId") or params.get("course_id")
    if not course_id:
        course_id = metrics.get("courseId") or metrics.get("course_id")

    tournament_flags = [
        params.get("tournamentSafe"),
        params.get("tournament_safe"),
        metrics.get("tournamentSafe"),
        metrics.get("tournament_safe"),
    ]
    tournament_safe = any(bool(flag) for flag in tournament_flags if flag is not None)

    shots_taken = 0
    metrics_shots = metrics.get("shotsTaken") or metrics.get("shots_taken")
    if isinstance(metrics_shots, (int, float)):
        shots_taken = int(metrics_shots)
    elif getattr(run, "events", None):
        try:
            shots_taken = len(run.events)
        except TypeError:
            shots_taken = 0

    sg_total = metrics.get("sg_delta_total") or metrics.get("sgDeltaTotal")
    sg_last = metrics.get("sg_delta_last_shot") or metrics.get("sgDeltaLastShot")

    return _RunContext(
        event_id=event_id,
        course_id=course_id,
        tournament_safe=tournament_safe,
        shots_taken=shots_taken,
        sg_delta_total=sg_total,
        sg_delta_last=sg_last,
    )


def _get_latest_tip(member_id: str) -> Optional[HudTip]:
    """Return the most recent tip for the member, if available."""

    tip = get_latest_tip_for_member(member_id)
    if tip is None:
        return None

    return HudTip(
        tipId=tip.tipId,
        title=tip.title,
        body=tip.body,
        club=tip.club,
        playsLike_m=tip.playsLike_m,
    )


def _find_hole(bundle: LegacyCourseBundle, hole_number: int) -> Optional[HoleBundle]:
    return next((hole for hole in bundle.holes if hole.number == hole_number), None)


def _compute_green_distances(
    bundle: LegacyCourseBundle,
    hole_number: int,
    position: Optional[GeoPoint],
) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    if not bundle or position is None:
        return (None, None, None)

    hole = _find_hole(bundle, hole_number)
    if not hole:
        return (None, None, None)

    green = hole.green
    try:
        to_middle = haversine_m(position, green.middle)
        to_front = haversine_m(position, green.front)
        to_back = haversine_m(position, green.back)
    except Exception:
        return (None, None, None)

    return (to_middle, to_front, to_back)


def resolve_hole_number(
    *,
    hero_bundle: Optional[HeroCourseBundle],
    legacy_bundle: Optional[LegacyCourseBundle],
    requested_hole: int,
    gnss: Optional[GeoPoint],
    auto_detect: bool,
) -> Tuple[int, Optional[SuggestedHole]]:
    """Resolve which hole to use for HUD rendering."""

    hole = requested_hole
    suggestion: Optional[SuggestedHole] = None

    if not auto_detect or gnss is None:
        return (hole, None)

    if hero_bundle:
        suggestion = suggest_hole_for_location(
            bundle=hero_bundle,
            lat=gnss.lat,
            lon=gnss.lon,
            last_hole=requested_hole,
        )
        if suggestion and suggestion.confidence >= AUTO_DETECT_MIN_CONFIDENCE:
            return (suggestion.hole, suggestion)
        suggestion = None

    if legacy_bundle:
        legacy_suggestion = suggest_hole(
            legacy_bundle, gnss.lat, gnss.lon, current_hole=requested_hole
        )
        if legacy_suggestion:
            hole = legacy_suggestion.hole

    return (hole, suggestion)


def _build_caddie_advice(
    *,
    run_id: str,
    hole: int,
    distance_m: Optional[float],
    wind_mps: Optional[float],
    wind_dir_deg: Optional[float],
    temp_c: Optional[float],
    elev_delta_m: Optional[float],
    shots_taken: int,
    tournament_safe: bool,
) -> Tuple[
    Optional[float],
    Optional[float],
    bool,
    Optional[str],
]:
    distance = distance_m if distance_m is not None else 150.0
    if distance <= 0:
        distance = 150.0

    env = EnvIn(
        wind_mps=wind_mps if wind_mps is not None else 0.0,
        wind_dir_deg=wind_dir_deg if wind_dir_deg is not None else 0.0,
        temp_c=temp_c if temp_c is not None else 20.0,
        elev_delta_m=elev_delta_m if elev_delta_m is not None else 0.0,
    )
    shot = ShotContext(before_m=max(distance, 1.0))
    bag = PlayerBag(carries_m=DEFAULT_BAG_CARRIES_M)

    try:
        advice = advise(
            AdviseIn(
                runId=run_id,
                hole=hole,
                shotNumber=shots_taken + 1 if shots_taken else None,
                shot=shot,
                env=env,
                bag=bag,
                tournament_safe=tournament_safe,
            )
        )
    except Exception:
        return (None, None, False, None)

    plays_like = advice.playsLike_m if not advice.silent else None
    confidence = advice.confidence if advice.confidence is not None else None
    return (plays_like, confidence, advice.silent, advice.silent_reason)


def build_hole_hud(
    member_id: str,
    run_id: str,
    hole: int,
    *,
    course_id: Optional[str] = None,
    gnss: Optional[GeoPoint] = None,
    wind_mps: Optional[float] = None,
    wind_dir_deg: Optional[float] = None,
    temp_c: Optional[float] = None,
    elev_delta_m: Optional[float] = None,
    auto_detect_hole: bool = True,
    plan: Optional[PlanName] = None,
    api_key: Optional[str] = None,
) -> HoleHud:
    """Construct a :class:`HoleHud` snapshot from available stores."""

    plan_name = _resolve_plan(api_key=api_key, override=plan)
    run_context = _load_run_context(run_id)
    if not course_id:
        course_id = run_context.course_id

    bundle = get_course_bundle(course_id) if course_id else None
    hero_bundle = get_hero_bundle(course_id) if course_id else None

    hole, _ = resolve_hole_number(
        hero_bundle=hero_bundle,
        legacy_bundle=bundle,
        requested_hole=hole,
        gnss=gnss,
        auto_detect=auto_detect_hole,
    )

    to_green = to_front = to_back = None
    hole_bundle: Optional[HoleBundle] = None
    if bundle:
        hole_bundle = _find_hole(bundle, hole)
        if gnss:
            to_green, to_front, to_back = _compute_green_distances(bundle, hole, gnss)

    distance_for_caddie = to_green
    if distance_for_caddie is None:
        # fall back to front/back distances before using default
        for candidate in (to_front, to_back):
            if candidate is not None:
                distance_for_caddie = candidate
                break

    pro_enabled = plan_name == "pro"
    plays_like = caddie_confidence = caddie_silent_reason = None
    caddie_silent = False

    if pro_enabled:
        (
            plays_like,
            caddie_confidence,
            caddie_silent,
            caddie_silent_reason,
        ) = _build_caddie_advice(
            run_id=run_id,
            hole=hole,
            distance_m=distance_for_caddie,
            wind_mps=wind_mps,
            wind_dir_deg=wind_dir_deg,
            temp_c=temp_c,
            elev_delta_m=elev_delta_m,
            shots_taken=run_context.shots_taken,
            tournament_safe=run_context.tournament_safe,
        )
    else:
        caddie_silent = True
        caddie_silent_reason = "plan_gated"

    active_tip = _get_latest_tip(member_id) if pro_enabled else None

    return HoleHud(
        eventId=run_context.event_id,
        runId=run_id,
        memberId=member_id,
        plan=plan_name,
        courseId=course_id,
        hole=hole,
        par=hole_bundle.par if hole_bundle else None,
        toGreen_m=to_green,
        toFront_m=to_front,
        toBack_m=to_back,
        playsLike_m=plays_like,
        caddie_confidence=caddie_confidence,
        caddie_silent=caddie_silent,
        caddie_silent_reason=caddie_silent_reason,
        wind_mps=wind_mps,
        wind_dir_deg=wind_dir_deg,
        temp_c=temp_c,
        elev_delta_m=elev_delta_m,
        shotsTaken=run_context.shots_taken,
        sg_delta_total=run_context.sg_delta_total,
        sg_delta_last_shot=run_context.sg_delta_last,
        activeTip=active_tip,
    )


__all__ = [
    "build_hole_hud",
    "_compute_green_distances",
]
