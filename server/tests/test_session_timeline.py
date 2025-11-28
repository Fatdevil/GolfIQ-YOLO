import importlib

import pytest

from server.schemas.anchors import AnchorIn


@pytest.fixture(autouse=True)
def reset_anchors():
    from server.services import anchors_store

    anchors_store._reset_state()
    yield
    anchors_store._reset_state()


@pytest.fixture
def runs_module(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    from server.storage import runs as runs_mod

    module = importlib.reload(runs_mod)
    yield module
    importlib.reload(runs_mod)


def _reload_service():
    from server.services import session_timeline as module

    return importlib.reload(module)


def test_build_session_timeline_combines_sources(monkeypatch, runs_module):
    run = runs_module.save_run(
        source="app",
        mode="play",
        params={"fps": 100.0, "missionId": "wedge_ladder_60_100"},
        metrics={
            "sequence": {
                "hip_peak_frame": 20,
                "shoulder_peak_frame": 30,
                "tempo": {"total_s": 1.2},
            }
        },
        events=[40],
    )

    from server.services import anchors_store

    anchors_store.create_or_confirm(
        run.run_id, AnchorIn(hole=1, shot=1, clipId="c1", tStartMs=0, tEndMs=1200)
    )
    anchors_store.create_or_confirm(
        run.run_id, AnchorIn(hole=2, shot=1, clipId="c2", tStartMs=2000, tEndMs=3200)
    )

    service = _reload_service()

    timeline = service.build_session_timeline(run.run_id)

    assert timeline.run_id == run.run_id
    assert timeline.events == sorted(timeline.events, key=lambda e: e.ts)
    assert min(event.ts for event in timeline.events) == 0.0

    types = {event.type for event in timeline.events}
    assert {
        "impact",
        "peak_hips",
        "peak_shoulders",
        "hole_transition",
        "mission_event",
    } <= types


def test_build_session_timeline_missing_run(monkeypatch, tmp_path):
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path))
    service = _reload_service()

    with pytest.raises(service.RunNotFoundError):
        service.build_session_timeline("missing-run")
