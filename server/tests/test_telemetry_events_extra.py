import importlib
from types import SimpleNamespace


def test_telemetry_noop_branch(monkeypatch):
    mod = importlib.import_module("server.telemetry.events")
    if hasattr(mod, "configured"):
        monkeypatch.setattr(mod, "configured", False, raising=False)
    if hasattr(mod, "export"):
        monkeypatch.setattr(mod, "export", lambda *args, **kwargs: None, raising=False)
    if hasattr(mod, "emit_event_host_action"):
        mod.emit_event_host_action(SimpleNamespace(event_id="e", action="start"))


def test_telemetry_configured_branch(monkeypatch):
    mod = importlib.import_module("server.telemetry.events")
    if hasattr(mod, "configured"):
        monkeypatch.setattr(mod, "configured", True, raising=False)
    if hasattr(mod, "export"):
        monkeypatch.setattr(mod, "export", lambda *args, **kwargs: None, raising=False)
    if hasattr(mod, "emit_event_host_action"):
        mod.emit_event_host_action(SimpleNamespace(event_id="e", action="close"))
