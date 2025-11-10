from datetime import datetime, timezone
from pathlib import Path

from server import flight_recorder


def test_should_record_thresholds(monkeypatch):
    assert not flight_recorder.should_record(0)
    assert flight_recorder.should_record(100)

    calls = []

    def fake_random():
        calls.append(True)
        return 0.4  # 40 < 50 ensures we record

    monkeypatch.setattr(flight_recorder._rng, "random", fake_random)
    assert flight_recorder.should_record(50)
    assert calls

    monkeypatch.setattr(flight_recorder._rng, "random", lambda: 0.8)
    assert not flight_recorder.should_record(50)


def test_record_appends_json(tmp_path: Path):
    event = {"ts": datetime.now(timezone.utc).isoformat(), "message": "ok"}
    output = flight_recorder.record(event, tmp_path)

    assert output.exists()
    payload = output.read_text(encoding="utf-8").strip().splitlines()
    assert payload[-1] == '{"ts":"%s","message":"ok"}' % event["ts"]
