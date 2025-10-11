from __future__ import annotations

from typing import Mapping, Optional

import pytest
from starlette.requests import Request

from server.config.playslike_config import (
    Measurement,
    TempAltConfig,
    resolveTempAltConfig,
)


async def _empty_receive() -> dict[str, object]:
    return {"type": "http.request"}


def make_request(
    headers: Optional[Mapping[str, str]] = None,
    query: Optional[Mapping[str, str]] = None,
) -> Request:
    raw_headers = []
    if headers:
        raw_headers = [
            (key.lower().encode("latin-1"), value.encode("latin-1"))
            for key, value in headers.items()
        ]
    query_string = ""
    if query:
        query_string = "&".join(f"{key}={value}" for key, value in query.items())
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": raw_headers,
        "query_string": query_string.encode("latin-1"),
    }
    return Request(scope, _empty_receive)


def test_resolve_tempalt_config_headers_override_rc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    req = make_request(
        headers={
            "x-pl-tempalt": "on",
            "x-pl-temp": "10C",
            "x-pl-alt": "500ft",
        }
    )
    req.state.playslike_config = {"tempAlt": {"enabled": False, "betaPerC": 0.0021}}

    cfg = resolveTempAltConfig(req)

    assert isinstance(cfg, TempAltConfig)
    assert cfg.enable is True
    assert cfg.temperature == Measurement(10.0, "C")
    assert cfg.altitudeASL == Measurement(500.0, "ft")
    assert cfg.betaPerC == pytest.approx(0.0021)


def test_resolve_tempalt_config_user_overrides_rc_and_course(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    req = make_request()
    req.state.remote_config = {
        "playsLike": {"tempAlt": {"enabled": True, "gammaPer100m": 0.0078}}
    }
    course = {"playsLike": {"tempAlt": {"altitudeASL": {"value": 900, "unit": "ft"}}}}
    user = {"tempAlt": {"enabled": False, "temperature": {"value": 12, "unit": "C"}}}

    cfg = resolveTempAltConfig(req, course=course, user=user)

    assert cfg.enable is False
    assert cfg.temperature == Measurement(12.0, "C")
    assert cfg.altitudeASL == Measurement(900.0, "ft")
    assert cfg.gammaPer100m == pytest.approx(0.0078)


def test_resolve_tempalt_config_query_overrides_and_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PLAYS_LIKE_TEMPALT_CAP_PER_COMPONENT", raising=False)
    monkeypatch.delenv("PLAYS_LIKE_TEMPALT_CAP_TOTAL", raising=False)
    req = make_request(
        query={
            "pl_temp": "50F",
            "pl_alt": "150m",
            "pl_tempalt": "off",
        }
    )

    cfg = resolveTempAltConfig(req)

    assert cfg.enable is False
    assert cfg.temperature == Measurement(50.0, "F")
    assert cfg.altitudeASL == Measurement(150.0, "m")
    assert cfg.caps["perComponent"] == pytest.approx(0.10)
    assert cfg.caps["total"] == pytest.approx(0.20)


def test_resolve_tempalt_config_environment_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PLAYS_LIKE_TEMPALT_ENABLED", "true")
    monkeypatch.setenv("PLAYS_LIKE_TEMPALT_BETA_PER_C", "0.0030")
    monkeypatch.setenv("PLAYS_LIKE_TEMPALT_GAMMA_PER_100M", "0.0091")
    monkeypatch.setenv("PLAYS_LIKE_TEMPALT_CAP_PER_COMPONENT", "0.15")
    monkeypatch.setenv("PLAYS_LIKE_TEMPALT_CAP_TOTAL", "0.25")

    req = make_request()

    cfg = resolveTempAltConfig(req)

    assert cfg.enable is True
    assert cfg.betaPerC == pytest.approx(0.0030)
    assert cfg.gammaPer100m == pytest.approx(0.0091)
    assert cfg.caps["perComponent"] == pytest.approx(0.15)
    assert cfg.caps["total"] == pytest.approx(0.25)


def test_resolve_tempalt_config_state_precedence() -> None:
    req = make_request()
    req.state.playslike_tempalt = {
        "enabled": True,
        "temperature": {"value": 14, "unit": "C"},
    }
    req.state.playslike_config = {
        "tempAlt": {"enabled": False, "temperature": {"value": -5, "unit": "C"}}
    }
    req.state.remote_config = {
        "playsLike": {
            "tempAlt": {
                "enabled": False,
                "temperature": {"value": 40, "unit": "F"},
                "caps": {"perComponent": 0.05, "total": 0.07},
            }
        }
    }

    cfg = resolveTempAltConfig(req)

    assert cfg.enable is True
    assert cfg.temperature == Measurement(14.0, "C")
    assert cfg.caps["perComponent"] == pytest.approx(0.10)
    assert cfg.caps["total"] == pytest.approx(0.20)


def test_resolve_tempalt_config_aliases_and_invalids() -> None:
    req = make_request(
        headers={"x-pl-temp": " 72 f ", "x-pl-tempalt": "nope"},
        query={"pl-alt": "328ft", "plTempAlt": "1"},
    )
    course = {
        "playsLike": {
            "tempAlt": {
                "altitude": {"value": 250, "unit": "m"},
                "caps": {"perComponent": "0.2", "total": "0.3"},
            }
        }
    }

    cfg = resolveTempAltConfig(req, course=course)

    assert cfg.enable is True
    assert cfg.temperature == Measurement(72.0, "F")
    assert cfg.altitudeASL == Measurement(328.0, "ft")
    assert cfg.caps["perComponent"] == pytest.approx(0.2)
    assert cfg.caps["total"] == pytest.approx(0.3)


def test_tempalt_helpers_guard_invalid_inputs() -> None:
    from server.config import playslike_config as module

    assert module._float("not-a-number") is None  # type: ignore[attr-defined]
    assert module._float(float("nan")) is None  # type: ignore[attr-defined]

    assert module._parse_measurement({"value": "bad", "unit": "C"}, {"C", "F"}) is None  # type: ignore[attr-defined]
    assert module._parse_measurement("42yd", {"m", "ft"}) is None  # type: ignore[attr-defined]
    assert module._parse_measurement({"value": 200, "unit": "yd"}, {"m", "ft"}) is None  # type: ignore[attr-defined]
    assert module._parse_measurement({"value": 10, "unit": "yd"}, {"yd"}) is None  # type: ignore[attr-defined]
    assert module._parse_measurement("42ft", {"m"}) is None  # type: ignore[attr-defined]
    assert module._parse_measurement("50F", {"C", "F"}) == Measurement(50.0, "F")  # type: ignore[attr-defined]

    nested = {"playsLike": {"tempAlt": {"enabled": True}}}
    assert module._extract_temp_alt_mapping(nested) == nested["playsLike"]["tempAlt"]  # type: ignore[attr-defined]
    assert module._extract_temp_alt_mapping({"tempAlt": {"enabled": False}}) == {"enabled": False}  # type: ignore[attr-defined]
    assert module._extract_temp_alt_mapping({"other": {}}) is None  # type: ignore[attr-defined]


def test_resolve_tempalt_config_rejects_invalid_query_and_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    req = make_request(
        headers={
            "x-pl-temp": "bogus",
            "x-pl-alt": "badunit",
            "x-pl-tempalt": "not-sure",
        },
        query={"pl_temp": "??", "pl_alt": "??", "pl_tempalt": "idk"},
    )

    req.state.remote_config = {
        "playsLike": {
            "tempAlt": {
                "temperature": {"value": "nan", "unit": "C"},
                "altitudeASL": {"value": "nan", "unit": "m"},
            }
        }
    }

    cfg = resolveTempAltConfig(req)

    assert cfg.temperature is None
    assert cfg.altitudeASL is None
    assert cfg.enable is False
