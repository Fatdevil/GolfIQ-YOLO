import importlib
import sys


def test_int_env_defaults_when_missing(monkeypatch):
    monkeypatch.delenv("MAX_ZIP_FILES", raising=False)
    sys.modules.pop("server.config", None)
    config = importlib.import_module("server.config")
    assert config.MAX_ZIP_FILES == 400


def test_env_parsing_handles_invalid(monkeypatch):
    monkeypatch.setenv("MAX_ZIP_SIZE_BYTES", "not-an-int")
    monkeypatch.setenv("MAX_ZIP_RATIO", "not-a-float")
    sys.modules.pop("server.config", None)
    config = importlib.import_module("server.config")
    assert config.MAX_ZIP_SIZE_BYTES == 50_000_000
    assert config.MAX_ZIP_RATIO == 200.0


def test_env_parsing_accepts_valid_values(monkeypatch):
    monkeypatch.setenv("MAX_VIDEO_BYTES", "123456")
    monkeypatch.setenv("MAX_ZIP_FILES", "42")
    sys.modules.pop("server.config", None)
    config = importlib.import_module("server.config")
    assert config.MAX_VIDEO_BYTES == 123456
    assert config.MAX_ZIP_FILES == 42


def test_env_bool_truthy_values(monkeypatch):
    monkeypatch.setenv("ENABLE_SPIN", "YeS")
    sys.modules.pop("server.config", None)
    config = importlib.import_module("server.config")
    assert config.ENABLE_SPIN is True


def teardown_module(module):  # noqa: D401 - test cleanup helper
    """Reset server.config module state between tests."""

    sys.modules.pop("server.config", None)
