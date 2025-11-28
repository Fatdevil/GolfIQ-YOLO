"""Plan-aware HUD gating behavior."""

from __future__ import annotations

import pytest

from server.caddie.schemas import AdviseOut
from server.watch import hud_service


class _StubRun:
    def __init__(self) -> None:
        self.params = {"courseId": "course-123"}
        self.metrics = {"shotsTaken": 2}
        self.events = [1, 2]


class _StubTip:
    def __init__(self) -> None:
        self.tipId = "tip-1"
        self.title = "Try 8i"
        self.body = "Smooth tempo"
        self.club = "8i"
        self.playsLike_m = 150.0


@pytest.fixture(autouse=True)
def stub_course(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hud_service, "get_course_bundle", lambda _course_id: None)
    monkeypatch.setattr(hud_service, "get_hero_bundle", lambda _course_id: None)
    monkeypatch.setattr(hud_service, "load_run", lambda _run_id: _StubRun())


@pytest.fixture
def advise_pro(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        hud_service,
        "advise",
        lambda *_args, **_kwargs: AdviseOut(
            playsLike_m=165.0,
            confidence=0.72,
            silent=False,
            silent_reason=None,
        ),
    )


def test_build_hole_hud_respects_pro_plan(
    monkeypatch: pytest.MonkeyPatch, advise_pro: None
) -> None:
    monkeypatch.setattr(
        hud_service, "get_latest_tip_for_member", lambda _member: _StubTip()
    )
    monkeypatch.setattr(hud_service, "lookup_plan_for_key", lambda _key: "pro")

    hud = hud_service.build_hole_hud(
        member_id="mem-1",
        run_id="run-1",
        hole=3,
        api_key="pro-key",
    )

    assert hud.plan == "pro"
    assert hud.playsLike_m == pytest.approx(165.0)
    assert hud.caddie_confidence == pytest.approx(0.72)
    assert hud.caddie_silent is False
    assert hud.activeTip is not None


def test_build_hole_hud_gates_free_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hud_service, "lookup_plan_for_key", lambda _key: "free")
    monkeypatch.setattr(
        hud_service, "get_latest_tip_for_member", lambda _member: _StubTip()
    )
    monkeypatch.setattr(
        hud_service,
        "advise",
        lambda *_args, **_kwargs: AdviseOut(
            playsLike_m=175.0,
            confidence=0.65,
            silent=False,
            silent_reason=None,
        ),
    )

    hud = hud_service.build_hole_hud(
        member_id="mem-1",
        run_id="run-1",
        hole=5,
        api_key="any",
    )

    assert hud.plan == "free"
    assert hud.playsLike_m is None
    assert hud.caddie_confidence is None
    assert hud.caddie_silent is True
    assert hud.caddie_silent_reason == "plan_gated"
    assert hud.activeTip is None
