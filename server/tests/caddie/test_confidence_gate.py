from __future__ import annotations

import math

from server.caddie.advise import advise
from server.caddie.config import MIN_CONFIDENCE_NORMAL
from server.caddie.schemas import AdviseIn, EnvIn, PlayerBag, ShotContext


def _build_request(**overrides) -> AdviseIn:
    base = AdviseIn(
        runId="round-1",
        hole=3,
        shot=ShotContext(before_m=150.0, target_bearing_deg=0.0, lie="fairway"),
        env=EnvIn(wind_mps=2.0, wind_dir_deg=180.0, temp_c=20.0, elev_delta_m=0.0),
        bag=PlayerBag(
            carries_m={
                "9i": 125.0,
                "8i": 135.0,
                "7i": 150.0,
                "6i": 162.0,
            }
        ),
    )
    return base.model_copy(update=overrides, deep=True)


def test_high_confidence_remains_audible() -> None:
    result = advise(_build_request())
    assert math.isclose(result.confidence, 1.0)
    assert result.confidence >= MIN_CONFIDENCE_NORMAL
    assert result.silent is False
    assert result.silent_reason is None


def test_low_confidence_marks_silent() -> None:
    request = _build_request(
        shot=ShotContext(before_m=240.0, target_bearing_deg=0.0, lie="fairway"),
        bag=PlayerBag(carries_m={"8i": 135.0, "7i": 150.0}),
    )
    result = advise(request)
    assert result.confidence < MIN_CONFIDENCE_NORMAL
    assert result.silent is True
    assert result.silent_reason == "low_confidence"
    assert result.playsLike_m is not None


def test_tournament_safe_hides_advice() -> None:
    request = _build_request(tournament_safe=True)
    result = advise(request)
    assert result.silent is True
    assert result.silent_reason == "tournament_safe"
    assert result.playsLike_m is None
    assert result.club is None
    assert result.reasoning == []
