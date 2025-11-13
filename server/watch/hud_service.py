"""Helpers to build watch HUD payloads from existing services."""

from __future__ import annotations

from typing import Optional

from server.watch.hud_schemas import HoleHud, HudTip
from server.services.watch_tip_bus import get_latest_tip_for_member


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


def build_hole_hud(member_id: str, run_id: str, hole: int) -> HoleHud:
    """Construct a :class:`HoleHud` snapshot from available stores.

    The implementation is intentionally lightweight for now—distances and other
    telemetry can be wired in as the geo/shot pipelines solidify.
    """

    # TODO: integrate run + shot data when those services are plumbed in.
    sg_delta_total: Optional[float] = None
    sg_delta_last: Optional[float] = None
    shots_taken = 0

    active_tip = _get_latest_tip(member_id)

    return HoleHud(
        eventId="evt-stub",
        runId=run_id,
        memberId=member_id,
        hole=hole,
        shotsTaken=shots_taken,
        sg_delta_total=sg_delta_total,
        sg_delta_last_shot=sg_delta_last,
        activeTip=active_tip,
    )


__all__ = ["build_hole_hud"]
