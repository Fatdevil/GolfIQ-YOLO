import logging

import pytest

from server.tracking import factory


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.delenv("GOLFIQ_TRACKER", raising=False)


def test_get_tracker_handles_invalid_env(monkeypatch, caplog):
    monkeypatch.setenv("GOLFIQ_TRACKER", "mystery")

    def _boom(module_name):
        raise ImportError("missing module")

    monkeypatch.setattr(factory.importlib, "import_module", _boom)

    with caplog.at_level(logging.WARNING):
        tracker_cls = factory.get_tracker()

    assert tracker_cls.name == "ByteTrackTrackerStub"
    assert any("Unknown GOLFIQ_TRACKER" in msg for msg in caplog.messages)


def test_get_tracker_sort_fallback(monkeypatch):
    def _boom(module_name):
        raise ImportError("missing module")

    monkeypatch.setattr(factory.importlib, "import_module", _boom)

    tracker_cls = factory.get_tracker("sort")

    assert tracker_cls.name == "SortTrackerStub"
