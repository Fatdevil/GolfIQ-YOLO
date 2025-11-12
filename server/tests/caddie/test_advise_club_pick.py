from __future__ import annotations

import pytest

from server.caddie.advise import advise
from server.caddie.schemas import AdviseIn, EnvIn, PlayerBag, ShotContext


@pytest.fixture()
def base_request() -> AdviseIn:
    return AdviseIn(
        runId="test",
        hole=1,
        shot=ShotContext(before_m=140.0, target_bearing_deg=0.0, lie="fairway"),
        env=EnvIn(),
        bag=PlayerBag(
            carries_m={
                "PW": 110.0,
                "9i": 125.0,
                "8i": 135.0,
                "7i": 150.0,
            }
        ),
    )


def test_selects_first_sufficient_club(base_request: AdviseIn) -> None:
    result = advise(base_request)
    assert result.club == "7i"
    assert any("plays-like" in line for line in result.reasoning)


def test_longest_club_when_none_suffice(base_request: AdviseIn) -> None:
    request = base_request.model_copy(deep=True)
    request.shot.before_m = 190.0
    request.bag.carries_m = {"9i": 120.0, "8i": 130.0}
    result = advise(request)
    assert result.club == "8i"
    assert result.playsLike_m >= 1.0
    assert any(line.startswith("Wind head") for line in result.reasoning[-1:])
