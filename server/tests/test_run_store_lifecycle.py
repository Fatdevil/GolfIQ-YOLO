import pytest

from server.storage import runs as runs_storage
from server.storage.runs import RunStatus, RunTransitionError


def test_invalid_transition_rejected(tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    record = runs_storage.create_run(
        run_id="00000000-0000-0000-0000-000000000001",
        source="test",
        source_type="analyze",
        status=RunStatus.PROCESSING,
        mode="detector",
        params={},
        metrics={},
        events=[],
    )

    with pytest.raises(RunTransitionError):
        runs_storage.update_run(record.run_id, status=RunStatus.QUEUED)

    persisted = runs_storage.get_run(record.run_id)
    assert persisted is not None
    assert persisted.status == RunStatus.PROCESSING
    assert persisted.finished_ts is None


def test_terminal_states_are_terminal(tmp_path):
    runs_storage._reset_store_for_tests(tmp_path)
    record = runs_storage.create_run(
        run_id="00000000-0000-0000-0000-000000000002",
        source="test",
        source_type="analyze",
        status=RunStatus.SUCCEEDED,
        mode="detector",
        params={},
        metrics={},
        events=[],
    )

    with pytest.raises(RunTransitionError):
        runs_storage.update_run(record.run_id, status=RunStatus.PROCESSING)

    persisted = runs_storage.get_run(record.run_id)
    assert persisted is not None
    assert persisted.status == RunStatus.SUCCEEDED
    assert persisted.finished_ts is not None
