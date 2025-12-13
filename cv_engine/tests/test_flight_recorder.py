import math

from cv_engine.telemetry.flight_recorder import FlightRecorder


def test_records_frames_and_shots_when_enabled():
    recorder = FlightRecorder(enabled=True, session_metadata={"session": "abc"})
    recorder.record_frame(0, inference_ms=10.0, detections=2, ball_tracks=1)
    recorder.record_frame(
        1, inference_ms=30.0, detections=1, ball_tracks=0, dropped=True
    )
    recorder.record_shot(
        0, start_frame=0, end_frame=1, classification="test", confidence=0.9
    )
    recorder.set_status("ok")

    output = recorder.to_dict()

    assert len(output["frames"]) == 2
    assert len(output["shots"]) == 1
    summary = output["summary"]
    assert summary["frameCount"] == 2
    assert summary["shotCount"] == 1
    assert math.isclose(summary["avgInferenceMs"], 20.0)
    assert summary["p95InferenceMs"] == 30.0
    assert summary["droppedFrames"] == 1
    assert summary["maxDroppedStreak"] == 1
    assert summary["maxConcurrentBallTracks"] == 1


def test_noop_when_disabled():
    recorder = FlightRecorder(enabled=False)
    recorder.record_frame(0, inference_ms=10.0, detections=1)
    recorder.record_shot(0, start_frame=0, end_frame=0)
    recorder.record_event("something", {"a": 1})
    recorder.set_status("ignored")

    output = recorder.to_dict()
    assert output["frames"] == []
    assert output["shots"] == []
    assert output["events"] == []
    assert output["summary"] is None
    assert output["status"] is None


def test_events_and_status_are_captured():
    recorder = FlightRecorder(enabled=True)
    recorder.record_event("calibration", {"ok": True})
    recorder.record_event("fallback", {"mode": "simple"})
    recorder.set_status("ok")

    output = recorder.to_dict()
    assert output["events"][0]["kind"] == "calibration"
    assert output["status"] == "ok"
    assert "simple" in output["summary"]["fallbackModesUsed"]
