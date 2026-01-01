from datetime import timedelta

from server.storage import runs as runs_storage
from server.storage.runs import RunSourceType, RunStatus


def _make_run(run_id: str, status: RunStatus) -> str:
    record = runs_storage.create_run(
        run_id=run_id,
        source="test",
        source_type=RunSourceType.ANALYZE.value,
        status=status,
        mode="detector",
        params={},
        metrics={},
        events=[],
    )
    return record.run_id


def test_prune_respects_max_runs_and_status(tmp_path, timewarp):
    runs_storage._reset_store_for_tests(tmp_path)
    advance = timewarp
    first = _make_run("00000000-0000-0000-0000-00000000000a", RunStatus.SUCCEEDED)
    advance(1.0)
    second = _make_run("00000000-0000-0000-0000-00000000000b", RunStatus.SUCCEEDED)
    advance(1.0)
    processing = _make_run("00000000-0000-0000-0000-00000000000c", RunStatus.PROCESSING)
    advance(1.0)
    third = _make_run("00000000-0000-0000-0000-00000000000d", RunStatus.FAILED)

    result = runs_storage.prune_runs(max_runs=2)
    assert result["scanned"] == 4
    assert result["deleted"] == 1
    remaining_ids = {r.run_id for r in runs_storage.list_runs(limit=10)}
    assert processing in remaining_ids  # processing runs are never deleted
    assert third in remaining_ids
    assert second in remaining_ids
    assert first not in remaining_ids


def test_prune_respects_max_age(tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    recent = _make_run("00000000-0000-0000-0000-000000000010", RunStatus.SUCCEEDED)
    old = _make_run("00000000-0000-0000-0000-000000000011", RunStatus.FAILED)

    two_days_seconds = timedelta(days=2).total_seconds()
    runs_storage.update_run(
        old,
        created_ts=(runs_storage.time.time() - two_days_seconds),
        finished_ts=(runs_storage.time.time() - two_days_seconds),
    )

    result = runs_storage.prune_runs(max_age_days=1)
    assert result["deleted"] == 1
    remaining_ids = {r.run_id for r in runs_storage.list_runs(limit=10)}
    assert recent in remaining_ids
    assert old not in remaining_ids
