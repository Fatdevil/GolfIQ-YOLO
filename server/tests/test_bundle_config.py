from __future__ import annotations

import pytest

from server.config import bundle_config


@pytest.fixture(autouse=True)
def clear_env(monkeypatch):
    monkeypatch.delenv("BUNDLE_ENABLED", raising=False)
    monkeypatch.delenv("BUNDLE_TTL_SECONDS", raising=False)


def test_extract_bundle_section_prefers_nested_bundle() -> None:
    section = bundle_config._extract_bundle_section({"bundle": {"enabled": False}})
    assert section == {"enabled": False}


def test_extract_bundle_section_accepts_top_level_keys() -> None:
    source = {"enabled": False, "ttlSeconds": 42}
    assert bundle_config._extract_bundle_section(source) == source


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (10, 10),
        (0, None),
        (4.8, 4),
        (-3.1, None),
        (" 123 ", 123),
        ("-2", None),
        (True, None),
        ("abc", None),
    ],
)
def test_coerce_positive_int_handles_various_inputs(value, expected) -> None:
    assert bundle_config._coerce_positive_int(value) == expected


def test_merge_config_returns_defaults_when_missing_section() -> None:
    merged = bundle_config._merge_config({"other": 1})
    assert merged == {
        "enabled": bundle_config.DEFAULT_BUNDLE_ENABLED,
        "ttlSeconds": bundle_config.DEFAULT_BUNDLE_TTL_SECONDS,
    }


def test_merge_config_applies_remote_overrides() -> None:
    merged = bundle_config._merge_config(
        {"bundle": {"enabled": False, "ttlSeconds": 9876}}
    )
    assert merged == {"enabled": False, "ttlSeconds": 9876}


def test_is_bundle_enabled_respects_remote_config(monkeypatch) -> None:
    remote_config = {"bundle": {"enabled": False}}
    assert bundle_config.is_bundle_enabled(remote_config) is False
    # env override wins
    monkeypatch.setenv("BUNDLE_ENABLED", "true")
    assert bundle_config.is_bundle_enabled(remote_config) is True


def test_get_bundle_ttl_prefers_env_then_remote(monkeypatch) -> None:
    remote_config = {"bundle": {"ttlSeconds": 111}}
    assert bundle_config.get_bundle_ttl(remote_config) == 111
    monkeypatch.setenv("BUNDLE_TTL_SECONDS", "222")
    assert bundle_config.get_bundle_ttl(remote_config) == 222


def test_get_bundle_ttl_falls_back_to_default(monkeypatch) -> None:
    remote_config = {"bundle": {"ttlSeconds": "invalid"}}
    monkeypatch.delenv("BUNDLE_TTL_SECONDS", raising=False)
    assert (
        bundle_config.get_bundle_ttl(remote_config)
        == bundle_config.DEFAULT_BUNDLE_TTL_SECONDS
    )
