from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import caddie_health


def _write_run_payload(
    root: Path, run_id: str, created_at: datetime, events: list[dict]
) -> None:
    runs_dir = root
    hud_dir = runs_dir / "hud"
    by_id_dir = runs_dir / "by_id"
    hud_dir.mkdir(parents=True, exist_ok=True)
    by_id_dir.mkdir(parents=True, exist_ok=True)

    day_file = hud_dir / f"{created_at.strftime('%Y-%m-%d')}.jsonl"
    entry = {
        "id": run_id,
        "kind": "hud",
        "created_at": created_at.replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "device": "test-device",
        "url": f"/runs/{run_id}",
        "size": 123,
    }
    with day_file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")

    by_id_path = by_id_dir / f"{run_id}.json"
    by_id_path.write_text(json.dumps(events), encoding="utf-8")


@pytest.mark.parametrize("since", [None, "24h"])
def test_caddie_health_snapshot(monkeypatch, tmp_path, since):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)
    events = [
        {
            "timestampMs": -1,
            "event": "hud.caddie.rollout",
            "data": {"mc": True, "advice": True, "tts": True},
        },
        {
            "timestampMs": 0,
            "event": "hud.caddie.plan",
            "data": {
                "club": "7I",
                "risk": 0.25,
                "aimDeg": 2.0,
                "D": 150.0,
                "mode": "approach",
                "mcUsed": True,
                "hadAdvice": True,
                "ttsUsed": True,
                "adviceText": ["+1 club", "80% tempo"],
            },
        },
        {
            "timestampMs": 1,
            "event": "hud.caddie.mc",
            "data": {
                "samples": 800,
                "hazardRate": 0.18,
                "successRate": 0.62,
                "ev": 0.42,
                "expectedLongMiss_m": 0.4,
                "expectedLatMiss_m": -0.15,
                "kind": "tee",
            },
        },
        {
            "timestampMs": 2,
            "event": "hud.caddie.tts",
            "data": {"chars": 48},
        },
        {
            "timestampMs": 3,
            "event": "hud.caddie.adopt",
            "data": {
                "adopted": True,
                "mcUsed": True,
                "hadAdvice": True,
                "ttsUsed": True,
            },
        },
    ]
    _write_run_payload(tmp_path, "run-001", now, events)

    client = TestClient(app)
    params = {"since": since} if since else {}
    response = client.get("/caddie/health", params=params)

    assert response.status_code == 200
    payload = response.json()
    assert "since" in payload
    assert payload["mc"]["enabledPct"] == pytest.approx(100.0)
    assert payload["mc"]["hazardRate"] == pytest.approx(0.18)
    assert payload["mc"]["hazardRateTee"] == pytest.approx(0.18)
    assert payload["mc"]["hazardRateApproach"] == pytest.approx(0.0)
    assert payload["mc"]["fairwayRate"] == pytest.approx(0.62)
    assert payload["mc"]["avgLongErr"] == pytest.approx(0.4)
    assert payload["mc"]["avgLatErr"] == pytest.approx(-0.15)
    assert payload["mc"]["evLift"] == pytest.approx(0.0)
    assert payload["mc"]["adoptRate"] == pytest.approx(1.0)
    assert payload["advice"]["adoptRate"] == pytest.approx(1.0)
    assert payload["advice"]["topAdvice"][0] == "+1 club"
    assert payload["advice"]["topAdvice"][1] == "80% tempo"
    assert payload["tts"]["playRate"] == pytest.approx(1.0)
    assert payload["tts"]["avgChars"] == pytest.approx(48.0)
    assert payload["mc"]["ab"]["enforced"]["plans"] == 1
    assert payload["tts"]["ab"]["enforced"]["plays"] == 1


def test_caddie_health_handles_empty_runs(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "30m"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["mc"]["enabledPct"] == 0.0
    assert payload["mc"]["adoptRate"] == 0.0
    assert payload["mc"]["hazardRate"] == 0.0
    assert payload["mc"]["hazardRateTee"] == 0.0
    assert payload["mc"]["hazardRateApproach"] == 0.0
    assert payload["mc"]["fairwayRate"] == 0.0
    assert payload["mc"]["avgLongErr"] == 0.0
    assert payload["mc"]["avgLatErr"] == 0.0
    assert payload["mc"]["evLift"] == 0.0
    assert payload["mc"]["ab"]["control"]["plans"] == 0
    assert payload["advice"]["adoptRate"] == 0.0
    assert payload["advice"]["topAdvice"] == []
    assert payload["advice"]["ab"]["control"]["plans"] == 0
    assert payload["tts"]["playRate"] == 0.0
    assert payload["tts"]["avgChars"] == 0.0
    assert payload["tts"]["ab"]["control"]["plays"] == 0


def test_caddie_health_filters_runs_outside_window(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)

    stale_events = [
        {
            "timestampMs": 0,
            "event": "hud.caddie.plan",
            "data": {
                "club": "7I",
                "risk": 0.3,
                "aimDeg": 1.0,
                "D": 155.0,
                "mode": "tee",
                "mcUsed": True,
                "hadAdvice": False,
                "ttsUsed": False,
            },
        },
        {
            "timestampMs": 1,
            "event": "hud.caddie.mc",
            "data": {
                "samples": 400,
                "hazardRate": 0.4,
                "successRate": 0.5,
                "ev": 0.8,
                "expectedLongMiss_m": 0.2,
                "expectedLatMiss_m": 0.05,
                "kind": "tee",
            },
        },
    ]

    _write_run_payload(tmp_path, "stale-run", now - timedelta(hours=3), stale_events)

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "1h"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["mc"]["hazardRate"] == 0.0
    assert payload["mc"]["hazardRateTee"] == 0.0
    assert payload["mc"]["hazardRateApproach"] == 0.0
    assert payload["mc"]["fairwayRate"] == 0.0
    assert payload["mc"]["avgLongErr"] == 0.0
    assert payload["mc"]["avgLatErr"] == 0.0
    assert payload["mc"]["evLift"] == 0.0


def test_caddie_health_mc_ev_lift_clamped(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)

    control_events = [
        {
            "timestampMs": 0,
            "event": "hud.caddie.plan",
            "data": {
                "club": "6I",
                "risk": 0.2,
                "aimDeg": -1.5,
                "D": 160.0,
                "mode": "tee",
                "mcUsed": False,
                "hadAdvice": False,
                "ttsUsed": False,
            },
        },
        {
            "timestampMs": 1,
            "event": "hud.caddie.mc",
            "data": {
                "samples": 100,
                "hazardRate": 0.1,
                "successRate": 0.45,
                "ev": 0.2,
                "expectedLongMiss_m": 0.3,
                "expectedLatMiss_m": -0.2,
                "kind": "tee",
            },
        },
    ]

    enforced_events = [
        {
            "timestampMs": 0,
            "event": "hud.caddie.plan",
            "data": {
                "club": "5I",
                "risk": 0.15,
                "aimDeg": 0.5,
                "D": 150.0,
                "mode": "tee",
                "mcUsed": True,
                "hadAdvice": False,
                "ttsUsed": False,
            },
        },
        {
            "timestampMs": 1,
            "event": "hud.caddie.mc",
            "data": {
                "samples": 100,
                "hazardRate": 0.05,
                "successRate": 0.6,
                "ev": 1.0,
                "expectedLongMiss_m": 0.1,
                "expectedLatMiss_m": -0.05,
                "kind": "tee",
            },
        },
    ]

    _write_run_payload(
        tmp_path, "control-run", now - timedelta(minutes=30), control_events
    )
    _write_run_payload(
        tmp_path, "enforced-run", now - timedelta(minutes=10), enforced_events
    )

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "2h"})

    assert response.status_code == 200
    payload = response.json()

    assert payload["mc"]["ab"]["control"]["plans"] == 1
    assert payload["mc"]["ab"]["enforced"]["plans"] == 1
    assert payload["mc"]["evLift"] == pytest.approx(0.25)


def test_caddie_health_rejects_invalid_since(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "invalid"})

    assert response.status_code == 400


def test_load_run_events_variants(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    by_id_dir = tmp_path / "by_id"
    by_id_dir.mkdir(parents=True)

    # missing file -> []
    assert caddie_health._load_run_events("missing") == []

    # invalid json -> []
    bad_path = by_id_dir / "bad.json"
    bad_path.write_text("not-json", encoding="utf-8")
    assert caddie_health._load_run_events("bad") == []

    # list with mixed types returns dict entries only
    good_path = by_id_dir / "good.json"
    good_payload = [
        {"event": "ok"},
        "ignore",
        123,
        {"event": "still-ok"},
    ]
    good_path.write_text(json.dumps(good_payload), encoding="utf-8")
    assert caddie_health._load_run_events("good") == [
        {"event": "ok"},
        {"event": "still-ok"},
    ]


def test_helper_numeric_utils():
    assert caddie_health._finite_float("1.5") == pytest.approx(1.5)
    assert caddie_health._finite_float("nan") is None
    assert caddie_health._finite_float(object()) is None

    assert caddie_health._median([]) is None
    assert caddie_health._median([3.0, 1.0, 2.0]) == pytest.approx(2.0)
    assert caddie_health._median([1.0, 2.0, 3.0, 4.0]) == pytest.approx(2.5)


def test_extract_ts_seconds_variants():
    assert caddie_health._extract_ts_seconds({}) is None
    assert caddie_health._extract_ts_seconds({"ts": "abc"}) is None
    assert caddie_health._extract_ts_seconds({"time": 42}) == pytest.approx(42.0)
    millis_event = {"timestampMs": 1_500_000_000_000}
    assert caddie_health._extract_ts_seconds(millis_event) == pytest.approx(
        1_500_000_000.0
    )


def test_focus_trend_helpers():
    now = datetime(2025, 1, 1, tzinfo=timezone.utc)
    entries = [
        (now - timedelta(days=1), 2.0),
        (now - timedelta(days=5), 1.0),
        (now - timedelta(days=10), 3.0),
        (now - timedelta(days=20), 4.0),
        (now - timedelta(days=40), 2.5),
    ]

    delta_7 = caddie_health._focus_window_delta(entries, now, timedelta(days=7))
    assert delta_7 is not None
    # current window contains days 1 and 5 averages -> (2+1)/2 = 1.5, previous window average = 3
    assert delta_7 == pytest.approx(1.5 - 3.0)

    trend = caddie_health._compute_focus_trend({"tee": entries}, now)
    assert "tee" in trend
    assert trend["tee"].d7 == pytest.approx(delta_7)
    assert isinstance(trend["tee"].d30, float)


def test_caddie_health_focus_and_coach_metrics(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)

    base_ms = int(now.timestamp() * 1000)

    events = [
        {
            "timestampMs": base_ms - 50,
            "event": "bad.event",
            "data": "ignore",
        },
        {
            "timestampMs": base_ms,
            "event": "hud.caddie.rollout",
            "data": {"mc": False, "advice": True, "tts": False},
        },
        {
            "timestampMs": base_ms + 100,
            "event": "hud.caddie.plan",
            "data": {
                "club": "8I",
                "risk": 0.2,
                "aimDeg": 0.0,
                "D": 140.0,
                "mode": "approach",
                "mcUsed": False,
                "hadAdvice": True,
                "ttsUsed": False,
                "adviceText": ["Play the draw"],
                "focus": "tee",
            },
        },
        {
            "timestampMs": base_ms + 150,
            "event": "hud.caddie.adopt",
            "data": {
                "adopted": True,
                "mcUsed": False,
                "hadAdvice": True,
                "ttsUsed": False,
            },
        },
        {
            "timestampMs": base_ms + 200,
            "event": "hud.shot",
            "data": {
                "planAdopted": True,
                "sg": {"total": 1.5, "byFocus": {"tee": 0.5}},
                "rollout": {"mc": True, "advice": True, "tts": False},
            },
        },
        {
            "timestampMs": base_ms + 300,
            "event": "hud.caddie.mc",
            "data": {
                "samples": 0,
                "hazardRate": 0.0,
                "successRate": 0.0,
                "ev": 0.1,
                "expectedLongMiss_m": 0.2,
                "expectedLatMiss_m": -0.2,
            },
        },
        {
            "timestampMs": base_ms + 400,
            "event": "coach.profile.updated",
            "data": {
                "dWeights": {"risk": 1.0, "distance": -2.0},
                "sgLiftByFocus": {"tee": 0.3, "invalid": "skip"},
            },
        },
    ]

    _write_run_payload(tmp_path, "focus-run", now, events)

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "12h"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["advice"]["topAdvice"] == ["Play the draw"]
    assert payload["adoption_by_focus"]["tee"]["adopts"] == 1
    assert payload["sg_gained_per_round_by_focus"]["tee"]["mean"] is not None
    assert payload["sg_trend_by_focus"]["tee"]["d7"] is not None
    assert payload["coach_weight_delta"] == pytest.approx(1.5)


def test_caddie_health_mc_and_tts_without_plan(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))
    now = datetime.now(timezone.utc)
    base_ms = int(now.timestamp() * 1000)

    events = [
        {
            "timestampMs": base_ms,
            "event": "hud.caddie.mc",
            "data": {
                "samples": -5,
                "hazardRate": 0.3,
                "successRate": 0.4,
                "ev": 0.05,
                "expectedLongMiss_m": 0.4,
                "expectedLatMiss_m": -0.1,
            },
        },
        {
            "timestampMs": base_ms + 100,
            "event": "hud.caddie.mc",
            "data": {
                "samples": 50,
                "hazardRate": 0.2,
                "successRate": 0.6,
                "ev": 0.3,
                "expectedLongMiss_m": 0.2,
                "expectedLatMiss_m": -0.05,
                "kind": "approach",
            },
        },
        {
            "timestampMs": base_ms + 200,
            "event": "hud.caddie.tts",
            "data": {"chars": 32},
        },
    ]

    _write_run_payload(tmp_path, "mc-tts-run", now, events)

    client = TestClient(app)
    response = client.get("/caddie/health", params={"since": "6h"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["mc"]["hazardRate"] == pytest.approx(0.2)
    assert payload["mc"]["hazardRateApproach"] == pytest.approx(0.2)
    assert payload["mc"]["fairwayRate"] == pytest.approx(0.6)
    assert payload["mc"]["avgLongErr"] == pytest.approx((10.0 + 0.4) / 51.0)
    assert payload["tts"]["avgChars"] == pytest.approx(32.0)
    assert payload["tts"]["ab"]["enforced"]["plays"] == 1


def test_since_param_parsing_variants():
    assert caddie_health._parse_since_param(None) == timedelta(hours=24)
    assert caddie_health._parse_since_param("45s") == timedelta(seconds=45)
    assert caddie_health._parse_since_param("15m") == timedelta(minutes=15)
    assert caddie_health._parse_since_param("2d") == timedelta(days=2)

    with pytest.raises(caddie_health.HTTPException):
        caddie_health._parse_since_param("bogus")


def test_parse_timestamp_variants():
    assert caddie_health._parse_timestamp(None) is None
    assert caddie_health._parse_timestamp(123) is None
    assert caddie_health._parse_timestamp("not-a-date") is None

    naive = datetime(2024, 1, 1, 12, 0, 0)
    naive_parsed = caddie_health._parse_timestamp(naive.isoformat())
    assert naive_parsed.tzinfo == timezone.utc

    zulu_parsed = caddie_health._parse_timestamp("2024-01-01T12:00:00Z")
    assert zulu_parsed.tzinfo == timezone.utc


def test_iter_recent_hud_runs_filters(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    # No HUD directory yet
    assert list(caddie_health._iter_recent_hud_runs(cutoff)) == []

    hud_dir = tmp_path / "hud"
    hud_dir.mkdir()

    # unreadable file triggers OSError branch
    unreadable = hud_dir / "2025-01-01.jsonl"
    unreadable.touch()
    unreadable.chmod(0)

    # invalid json entry should be ignored
    bad_entry = hud_dir / "2025-01-02.jsonl"
    bad_entry.write_text("{invalid json}\n", encoding="utf-8")

    # old run should be filtered out by cutoff
    old_entry = {
        "id": "old-run",
        "created_at": (datetime.now(timezone.utc) - timedelta(days=2))
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
    }
    (hud_dir / "2025-01-03.jsonl").write_text(
        json.dumps(old_entry) + "\n", encoding="utf-8"
    )

    # valid entry passes through
    recent_entry = {
        "id": "recent-run",
        "created_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
    }
    (hud_dir / "2025-01-04.jsonl").write_text(
        json.dumps(recent_entry) + "\n", encoding="utf-8"
    )

    runs = list(caddie_health._iter_recent_hud_runs(cutoff))
    assert runs == ["recent-run"]


def test_load_run_events_filters(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    by_id_dir = tmp_path / "by_id"
    by_id_dir.mkdir()

    bad_file = by_id_dir / "broken.json"
    bad_file.write_text("{not json", encoding="utf-8")
    assert caddie_health._load_run_events("broken") == []

    mixed_file = by_id_dir / "mixed.json"
    mixed_file.write_text(json.dumps([{"event": "ok"}, 123, "nope"]), encoding="utf-8")
    assert caddie_health._load_run_events("mixed") == [{"event": "ok"}]
