from __future__ import annotations

from typing import Mapping, Optional

import pytest
from fastapi import Request

import math

import server.config.playslike_wind_config as wind_module
from server.config.playslike_wind_config import (
    WindSlopeCoefficients,
    WindSlopeConfig,
    WindSlopeDelta,
    WindVector,
    SlopeSetting,
    compute_wind_slope_delta,
    resolveWindSlopeConfig,
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


def test_resolve_wind_slope_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "PLAYS_LIKE_WIND_ENABLED",
        "PLAYS_LIKE_WIND_HEAD_PER_MPS",
        "PLAYS_LIKE_WIND_SLOPE_PER_M",
        "PLAYS_LIKE_WIND_CROSS_AIM_DEG_PER_MPS",
        "PLAYS_LIKE_WIND_CAP_PER_COMPONENT",
        "PLAYS_LIKE_WIND_CAP_TOTAL",
    ):
        monkeypatch.delenv(key, raising=False)

    req = make_request()

    cfg = resolveWindSlopeConfig(req)

    assert isinstance(cfg, WindSlopeConfig)
    assert cfg.enable is False
    assert cfg.wind is None
    assert cfg.slope is None
    assert cfg.coeff == WindSlopeCoefficients(
        head_per_mps=pytest.approx(0.015),
        slope_per_m=pytest.approx(0.90),
        cross_aim_deg_per_mps=pytest.approx(0.35),
        cap_per_component=pytest.approx(0.15),
        cap_total=pytest.approx(0.25),
    )


def test_resolve_wind_slope_request_overrides() -> None:
    req = make_request(
        headers={
            "x-pl-wind-slope": "on",
            "x-pl-wind": "speed=5;from=45;target=90",
            "x-pl-slope": "dh=-12ft",
        }
    )

    cfg = resolveWindSlopeConfig(req)

    assert cfg.enable is True
    assert cfg.wind is not None
    assert cfg.wind.speed_mps == pytest.approx(5.0)
    assert cfg.wind.direction_deg_from == pytest.approx(45.0)
    assert cfg.wind.target_azimuth_deg == pytest.approx(90.0)
    assert cfg.slope is not None
    assert cfg.slope.delta_height_m == pytest.approx(-3.6576, rel=1e-4)


def test_resolve_wind_slope_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLAYS_LIKE_WIND_ENABLED", "true")
    monkeypatch.setenv("PLAYS_LIKE_WIND_HEAD_PER_MPS", "0.02")
    monkeypatch.setenv("PLAYS_LIKE_WIND_SLOPE_PER_M", "0.75")
    monkeypatch.setenv("PLAYS_LIKE_WIND_CROSS_AIM_DEG_PER_MPS", "0.25")
    monkeypatch.setenv("PLAYS_LIKE_WIND_CAP_PER_COMPONENT", "0.2")
    monkeypatch.setenv("PLAYS_LIKE_WIND_CAP_TOTAL", "0.3")

    req = make_request()

    cfg = resolveWindSlopeConfig(req)

    assert cfg.enable is True
    assert cfg.coeff.head_per_mps == pytest.approx(0.02)
    assert cfg.coeff.slope_per_m == pytest.approx(0.75)
    assert cfg.coeff.cross_aim_deg_per_mps == pytest.approx(0.25)
    assert cfg.coeff.cap_per_component == pytest.approx(0.2)
    assert cfg.coeff.cap_total == pytest.approx(0.3)


def test_resolve_wind_slope_state_and_course_precedence() -> None:
    req = make_request()
    req.state.playslike_wind = {"enabled": True, "coeff": {"head_per_mps": 0.03}}
    req.state.remote_config = {
        "playsLike": {"wind": {"enabled": False, "slope_per_m": 0.5}}
    }
    course = {"playsLike": {"wind": {"slope": {"deltaHeight_m": 12}}}}
    user = {
        "playsLike": {"wind": {"wind": {"speed_mps": 3, "direction_deg_from": 270}}}
    }

    cfg = resolveWindSlopeConfig(req, course=course, user=user)

    assert cfg.enable is True
    assert cfg.coeff.head_per_mps == pytest.approx(0.03)
    assert cfg.coeff.slope_per_m == pytest.approx(0.5)
    assert cfg.slope is not None
    assert cfg.slope.delta_height_m == pytest.approx(12.0)
    assert cfg.wind is not None
    assert cfg.wind.speed_mps == pytest.approx(3.0)
    assert cfg.wind.direction_deg_from == pytest.approx(270.0)


def test_resolve_wind_slope_nested_coeff_caps() -> None:
    req = make_request()
    req.state.remote_config = {
        "playsLike": {
            "wind": {
                "coeff": {
                    "head_per_mps": "0.021",
                    "caps": {"perComponent": "0.05", "total": "-0.1"},
                }
            }
        }
    }
    req.state.playslike_wind_slope = {
        "coeff": {
            "crossAimDegPerMps": "0.45",
            "cap_total": "0.3",
        }
    }

    cfg = resolveWindSlopeConfig(req)

    assert cfg.coeff.head_per_mps == pytest.approx(0.021)
    assert cfg.coeff.cross_aim_deg_per_mps == pytest.approx(0.45)
    assert cfg.coeff.cap_per_component == pytest.approx(0.05)
    # nested caps clamp negative values before later overrides are applied
    assert cfg.coeff.cap_total == pytest.approx(0.3)


def test_resolve_wind_slope_query_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLAYS_LIKE_WIND_ENABLED", "false")
    req = make_request(
        query={
            "pl_wind_slope": "1",
            "pl_wind": '{"speed_mps":8,"direction_deg_from":0}',
            "pl_slope": "dh=5m",
        },
    )

    cfg = resolveWindSlopeConfig(req)

    assert cfg.enable is True
    assert cfg.wind is not None
    assert cfg.wind.speed_mps == pytest.approx(8.0)
    assert cfg.wind.direction_deg_from == pytest.approx(0.0)
    assert cfg.slope is not None
    assert cfg.slope.delta_height_m == pytest.approx(5.0)


def test_resolve_wind_slope_hyphenated_query_keys() -> None:
    req = make_request(
        query={
            "pl-wind-slope": "true",
            "pl-wind": "speed=4;from=180",
            "pl-slope": "dh=-6",
        }
    )

    cfg = resolveWindSlopeConfig(req)

    assert cfg.enable is True
    assert cfg.wind is not None
    assert cfg.wind.speed_mps == pytest.approx(4.0)
    assert cfg.wind.direction_deg_from == pytest.approx(180.0)
    assert cfg.slope is not None
    assert cfg.slope.delta_height_m == pytest.approx(-6.0)


def test_resolve_wind_slope_header_disable_overrides_rc() -> None:
    req = make_request(headers={"x-pl-wind-slope": "off"})
    req.state.remote_config = {
        "playsLike": {"wind": {"enabled": True, "head_per_mps": 0.05}}
    }

    cfg = resolveWindSlopeConfig(req)

    assert cfg.enable is False
    assert cfg.coeff.head_per_mps == pytest.approx(0.05)


def test_compute_wind_slope_delta_head_tail() -> None:
    cfg = WindSlopeConfig(
        enable=True,
        wind=WindVector(speed_mps=5.0, direction_deg_from=0.0, target_azimuth_deg=0.0),
        slope=None,
        coeff=WindSlopeCoefficients(
            head_per_mps=0.015,
            slope_per_m=0.9,
            cross_aim_deg_per_mps=0.35,
            cap_per_component=0.15,
            cap_total=0.25,
        ),
    )
    head = compute_wind_slope_delta(150.0, cfg)
    assert head.delta_head_m == pytest.approx(-11.25, rel=1e-3)

    tail_cfg = cfg.__class__(
        enable=True,
        wind=WindVector(
            speed_mps=5.0, direction_deg_from=180.0, target_azimuth_deg=0.0
        ),
        slope=None,
        coeff=cfg.coeff,
    )
    tail = compute_wind_slope_delta(150.0, tail_cfg)
    assert tail.delta_head_m == pytest.approx(11.25, rel=1e-3)


def test_compute_wind_slope_delta_requires_positive_distance() -> None:
    cfg = WindSlopeConfig(
        enable=True,
        wind=WindVector(speed_mps=5.0, direction_deg_from=0.0, target_azimuth_deg=0.0),
        slope=SlopeSetting(delta_height_m=5.0),
        coeff=WindSlopeCoefficients(
            head_per_mps=0.015,
            slope_per_m=0.9,
            cross_aim_deg_per_mps=0.35,
            cap_per_component=0.15,
            cap_total=0.25,
        ),
    )

    zero = compute_wind_slope_delta(0.0, cfg)
    assert zero == WindSlopeDelta(0.0, 0.0, 0.0, None, tuple())

    negative = compute_wind_slope_delta(-125.0, cfg)
    assert negative == WindSlopeDelta(0.0, 0.0, 0.0, None, tuple())


def test_compute_wind_slope_delta_slope_and_crosswind() -> None:
    cfg = WindSlopeConfig(
        enable=True,
        wind=WindVector(speed_mps=5.0, direction_deg_from=90.0, target_azimuth_deg=0.0),
        slope=SlopeSetting(delta_height_m=10.0),
        coeff=WindSlopeCoefficients(
            head_per_mps=0.015,
            slope_per_m=0.9,
            cross_aim_deg_per_mps=0.35,
            cap_per_component=0.15,
            cap_total=0.25,
        ),
    )
    delta = compute_wind_slope_delta(150.0, cfg)
    assert delta.delta_head_m == pytest.approx(0.0, abs=1e-6)
    assert delta.delta_slope_m == pytest.approx(-9.0, rel=1e-3)
    assert delta.aim_adjust_deg == pytest.approx(1.75, rel=1e-3)


def test_compute_wind_slope_delta_caps() -> None:
    cfg = WindSlopeConfig(
        enable=True,
        wind=WindVector(speed_mps=40.0, direction_deg_from=0.0, target_azimuth_deg=0.0),
        slope=SlopeSetting(delta_height_m=-10.0),
        coeff=WindSlopeCoefficients(
            head_per_mps=0.015,
            slope_per_m=0.9,
            cross_aim_deg_per_mps=0.35,
            cap_per_component=0.5,
            cap_total=0.1,
        ),
    )
    delta = compute_wind_slope_delta(200.0, cfg)
    assert abs(delta.delta_total_m) == pytest.approx(20.0, rel=1e-3)
    assert "total_capped" in delta.notes


def test_compute_wind_slope_delta_cap_total_zero() -> None:
    cfg = WindSlopeConfig(
        enable=True,
        wind=WindVector(speed_mps=10.0, direction_deg_from=0.0, target_azimuth_deg=0.0),
        slope=SlopeSetting(delta_height_m=10.0),
        coeff=WindSlopeCoefficients(
            head_per_mps=0.015,
            slope_per_m=0.9,
            cross_aim_deg_per_mps=0.35,
            cap_per_component=0.2,
            cap_total=0.0,
        ),
    )

    delta = compute_wind_slope_delta(150.0, cfg)

    assert delta.delta_head_m == pytest.approx(0.0)
    assert delta.delta_slope_m == pytest.approx(0.0)
    assert delta.delta_total_m == pytest.approx(0.0)
    assert "total_capped" in delta.notes


def test_compute_wind_slope_delta_disabled() -> None:
    cfg = WindSlopeConfig(
        enable=False,
        wind=WindVector(speed_mps=10.0, direction_deg_from=0.0, target_azimuth_deg=0.0),
        slope=SlopeSetting(delta_height_m=5.0),
        coeff=WindSlopeCoefficients(
            head_per_mps=0.015,
            slope_per_m=0.9,
            cross_aim_deg_per_mps=0.35,
            cap_per_component=0.15,
            cap_total=0.25,
        ),
    )
    delta = compute_wind_slope_delta(150.0, cfg)
    assert delta.delta_total_m == pytest.approx(0.0)


def test_float_and_mapping_helpers_cover_edge_cases() -> None:
    assert wind_module._float("bogus") is None
    assert wind_module._float(" nan ") is None
    assert wind_module._float(12) == pytest.approx(12.0)

    # _parse_kv_string trims keys, ignores bare tokens, and lowercases names
    mapping = wind_module._coerce_mapping(" speed=5;foo;FROM = 90 ")
    assert mapping == {"speed": "5", "from": "90"}
    kv_pairs = wind_module._parse_kv_string(" speed = 5 ; = 1 ; target = 90 ")
    assert kv_pairs == {"speed": "5", "target": "90"}

    # blank strings and malformed JSON short-circuit to None
    assert wind_module._coerce_mapping("   ") is None
    assert wind_module._coerce_mapping('{"speed":5') is None

    # _first_present skips missing/None values before returning the first match
    result = wind_module._first_present({"speed": None, "from": 45}, ("speed", "from"))
    assert result == 45


def test_parse_delta_height_variants() -> None:
    # mapping recursion through "dh" payloads
    payload = {"deltaHeight_m": None, "dh": {"value": "12", "unit": "ft"}}
    parsed = wind_module._parse_delta_height(payload)
    assert parsed == pytest.approx(12 * 0.3048)

    # strings that do not match the regex produce None
    assert wind_module._parse_delta_height(" uphill") is None
    assert wind_module._parse_delta_height({"value": "oops"}) is None

    # feet suffix converts to metres while numeric literals pass through
    assert wind_module._parse_delta_height("-5 ft") == pytest.approx(-5 * 0.3048)
    assert wind_module._parse_delta_height(-3.5) == pytest.approx(-3.5)


def test_parse_wind_and_merge_coefficients_helpers() -> None:
    # parse_wind rejects payloads without a direction component
    assert wind_module._parse_wind({"speed": 5}) is None

    config: dict[str, object] = {
        "coeff": {
            "head_per_mps": 0.01,
            "slope_per_m": 0.8,
            "cross_aim_deg_per_mps": 0.25,
            "cap_per_component": 0.1,
            "cap_total": 0.2,
        }
    }
    wind_module._merge_coefficients(
        config,
        {
            "coeff": {"headPerMps": "0.02"},
            "caps": {"per_component": "0.05", "total": "-0.1"},
            "cap_total": 0.15,
        },
    )
    coeff = config["coeff"]
    assert math.isclose(coeff["head_per_mps"], 0.02)
    assert math.isclose(coeff["cap_per_component"], 0.05)
    assert math.isclose(coeff["cap_total"], 0.15)


def test_extract_wind_mapping_and_merge_from_mapping() -> None:
    nested = {
        "playsLike": {
            "wind": {
                "enabled": True,
                "wind": {"speed_mps": 3, "direction_deg_from": 180},
                "slope": {"deltaHeight_m": 4},
            }
        }
    }
    extracted = wind_module._extract_wind_mapping(nested)
    assert extracted is not None

    config: dict[str, object] = {
        "enable": False,
        "wind": None,
        "slope": None,
        "coeff": {
            "head_per_mps": 0.015,
            "slope_per_m": 0.9,
            "cross_aim_deg_per_mps": 0.35,
            "cap_per_component": 0.15,
            "cap_total": 0.25,
        },
    }

    wind_module._merge_from_mapping(config, extracted)

    assert config["enable"] is True
    assert isinstance(config["wind"], dict) and config["wind"]["direction_deg_from"] == 180
    assert config["slope"] == {"deltaHeight_m": 4}

    # unrelated mappings return None
    assert wind_module._extract_wind_mapping({"foo": 1}) is None


def test_apply_request_overrides_and_clamp_helper() -> None:
    config: dict[str, object] = {
        "enable": True,
        "wind": None,
        "slope": None,
        "coeff": {
            "head_per_mps": 0.015,
            "slope_per_m": 0.9,
            "cross_aim_deg_per_mps": 0.35,
            "cap_per_component": 0.15,
            "cap_total": 0.25,
        },
    }
    req = make_request(
        query={
            "pl_wind_slope": "false",
            "pl_wind": "speed=7;from=90",
            "pl_slope": "dh=2",
        }
    )
    wind_module._apply_request_overrides(config, req)
    assert config["enable"] is False
    assert config["wind"] is not None
    assert config["slope"] == {"deltaHeight_m": pytest.approx(2.0)}

    notes: list[str] = []
    assert wind_module._clamp_with_note(float("inf"), 10.0, notes, "note") == 0.0
    assert wind_module._clamp_with_note(5.0, 0.0, notes, "note") == 0.0
    assert wind_module._clamp_with_note(5.0, 4.0, notes, "cap") == pytest.approx(4.0)
    assert "cap" in notes
