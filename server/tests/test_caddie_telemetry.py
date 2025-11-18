import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import caddie_telemetry
from server.schemas.caddie_telemetry import (
    CADDIE_ADVICE_ACCEPTED_V1,
    CADDIE_ADVICE_SHOWN_V1,
    SHOT_OUTCOME_V1,
)
from server.services import caddie_telemetry as builders


def test_build_advice_shown_event() -> None:
    event = builders.build_caddie_advice_shown_event(
        member_id="m1",
        run_id="r1",
        hole=5,
        recommended_club="7i",
        shot_index=2,
        course_id="c1",
        target_distance_m=145.0,
        advice_id="adv-1",
    )

    assert event.type == CADDIE_ADVICE_SHOWN_V1
    assert event.memberId == "m1"
    assert event.runId == "r1"
    assert event.hole == 5
    assert event.shotIndex == 2
    assert event.courseId == "c1"
    assert event.recommendedClub == "7i"
    assert event.targetDistance_m == 145.0
    assert event.adviceId == "adv-1"


def test_build_advice_accepted_event_defaults_selected() -> None:
    event = builders.build_caddie_advice_accepted_event(
        member_id="m1",
        run_id="r1",
        hole=3,
        recommended_club="PW",
    )

    assert event.type == CADDIE_ADVICE_ACCEPTED_V1
    assert event.selectedClub == "PW"
    assert event.recommendedClub == "PW"


def test_build_shot_outcome_event() -> None:
    event = builders.build_shot_outcome_event(
        member_id="m1",
        run_id="r1",
        hole=9,
        club="9i",
        carry_m=120.5,
        end_distance_to_pin_m=8.3,
        result_category="green",
    )

    assert event.type == SHOT_OUTCOME_V1
    assert event.club == "9i"
    assert event.carry_m == 120.5
    assert event.endDistanceToPin_m == 8.3
    assert event.resultCategory == "green"


@pytest.fixture(autouse=True)
def _api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_KEY", "secret")
    monkeypatch.setenv("REQUIRE_API_KEY", "1")


class _Capture:
    def __init__(self) -> None:
        self.messages: list[dict[str, object]] = []

    async def broadcast(self, message: dict[str, object]) -> int:
        self.messages.append(message)
        return 1


def test_ingest_caddie_telemetry(monkeypatch: pytest.MonkeyPatch) -> None:
    capture = _Capture()
    monkeypatch.setattr(caddie_telemetry.ws_telemetry.manager, "broadcast", capture.broadcast)
    monkeypatch.setattr(caddie_telemetry.ws_telemetry, "should_record", lambda pct: False)

    client = TestClient(app)

    payload = {
        "type": CADDIE_ADVICE_SHOWN_V1,
        "memberId": "m1",
        "runId": "r1",
        "hole": 4,
        "recommendedClub": "8i",
        "targetDistance_m": 150,
    }

    resp = client.post("/api/caddie/telemetry", json=payload, headers={"x-api-key": "secret"})

    assert resp.status_code == 200
    assert resp.json()["accepted"] == 1
    assert capture.messages[0]["type"] == CADDIE_ADVICE_SHOWN_V1
    assert capture.messages[0]["recommendedClub"] == "8i"


def test_ingest_caddie_telemetry_missing_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(caddie_telemetry.ws_telemetry.manager, "broadcast", lambda message: 0)  # type: ignore[arg-type]
    monkeypatch.setattr(caddie_telemetry.ws_telemetry, "should_record", lambda pct: False)

    client = TestClient(app)

    payload = {
        "type": CADDIE_ADVICE_ACCEPTED_V1,
        "memberId": "m1",
        "runId": "r1",
        "hole": 4,
    }

    resp = client.post("/api/caddie/telemetry", json=payload, headers={"x-api-key": "secret"})

    assert resp.status_code == 422
