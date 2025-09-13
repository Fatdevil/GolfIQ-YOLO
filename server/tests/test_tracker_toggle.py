import importlib
import types
from contextlib import contextmanager

from server.tracking.factory import get_tracker


@contextmanager
def fake_modules():
    # Fakea module deps så importlib hittar våra stubbar
    bt = types.SimpleNamespace(ByteTrackTracker=type("BT", (), {"name": "BT"}))
    so = types.SimpleNamespace(SortTracker=type("SO", (), {"name": "SO"}))
    real_import = importlib.import_module

    def _fake(name, package=None):
        if name == "cv_engine.tracking.bytetrack_impl":
            return bt
        if name == "cv_engine.tracking.sort_impl":
            return so
        return real_import(name, package)

    importlib.import_module = _fake
    try:
        yield
    finally:
        importlib.import_module = real_import


def test_default_env_is_bytetrack(monkeypatch):
    monkeypatch.delenv("GOLFIQ_TRACKER", raising=False)
    with fake_modules():
        cls = get_tracker()
        assert getattr(cls, "name", "") in ("BT", "ByteTrackTrackerStub")


def test_sort_selected_via_env(monkeypatch):
    monkeypatch.setenv("GOLFIQ_TRACKER", "sort")
    with fake_modules():
        cls = get_tracker()
        assert getattr(cls, "name", "") in ("SO", "SortTrackerStub")


def test_invalid_value_falls_back_and_warns(monkeypatch, caplog):
    monkeypatch.setenv("GOLFIQ_TRACKER", "what")
    with fake_modules(), caplog.at_level("WARNING"):
        cls = get_tracker()
        assert any("Unknown GOLFIQ_TRACKER" in r.message for r in caplog.records)
        assert getattr(cls, "name", "") in ("BT", "ByteTrackTrackerStub")
