from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping, Optional

from fastapi import Request

from . import coerce_boolish

_DEFAULT_HEAD_PER_MPS = 0.015
_DEFAULT_SLOPE_PER_M = 0.90
_DEFAULT_CROSS_AIM_DEG_PER_MPS = 0.35
_DEFAULT_CAP_PER_COMPONENT = 0.15
_DEFAULT_CAP_TOTAL = 0.25

_FT_TO_M = 0.3048

_WIND_KEYS = {
    "head_per_mps",
    "slope_per_m",
    "cross_aim_deg_per_mps",
    "cap_per_component",
    "cap_total",
    "coeff",
    "caps",
    "wind",
    "slope",
    "enabled",
    "speed_mps",
    "direction_deg_from",
    "targetAzimuth_deg",
    "deltaHeight_m",
}


@dataclass(frozen=True)
class WindVector:
    speed_mps: float
    direction_deg_from: float
    target_azimuth_deg: Optional[float]


@dataclass(frozen=True)
class SlopeSetting:
    delta_height_m: float


@dataclass(frozen=True)
class WindSlopeCoefficients:
    head_per_mps: float
    slope_per_m: float
    cross_aim_deg_per_mps: float
    cap_per_component: float
    cap_total: float


@dataclass(frozen=True)
class WindSlopeConfig:
    enable: bool
    wind: Optional[WindVector]
    slope: Optional[SlopeSetting]
    coeff: WindSlopeCoefficients


@dataclass(frozen=True)
class WindSlopeDelta:
    delta_head_m: float
    delta_slope_m: float
    delta_total_m: float
    aim_adjust_deg: Optional[float]
    notes: tuple[str, ...]


def _float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and value == value:
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value.strip())
        except ValueError:
            return None
        if parsed == parsed:
            return parsed
    return None


def _parse_kv_string(value: str) -> Mapping[str, str]:
    mapping: dict[str, str] = {}
    for token in re.split(r"[;,]", value):
        if "=" not in token:
            continue
        key, raw = token.split("=", 1)
        key_norm = key.strip().lower()
        if not key_norm:
            continue
        mapping[key_norm] = raw.strip()
    return mapping


def _coerce_mapping(value: Any) -> Optional[Mapping[str, Any]]:
    if isinstance(value, Mapping):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.startswith("{"):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                return None
            return parsed if isinstance(parsed, Mapping) else None
        kv = _parse_kv_string(text)
        return kv if kv else None
    return None


def _first_present(mapping: Mapping[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in mapping:
            candidate = mapping.get(key)
            if candidate is not None:
                return candidate
    return None


def _parse_delta_height(value: Any) -> Optional[float]:
    if isinstance(value, Mapping):
        candidate = value.get("deltaHeight_m")
        if candidate is None:
            candidate = value.get("delta_height_m")
        if candidate is None:
            candidate = value.get("value")
        parsed = _float(candidate)
        if parsed is None:
            dh = value.get("dh")
            if dh is not None:
                return _parse_delta_height(dh)
            return None
        unit = value.get("unit")
        if isinstance(unit, str) and unit.lower() == "ft":
            return parsed * _FT_TO_M
        return parsed
    if isinstance(value, str):
        mapping = _coerce_mapping(value)
        if mapping:
            return _parse_delta_height(mapping)
        match = re.match(r"^\s*([-+]?\d+(?:\.\d+)?)\s*(m|ft)?\s*$", value, re.IGNORECASE)
        if not match:
            return None
        magnitude = float(match.group(1))
        unit = match.group(2)
        if unit and unit.lower() == "ft":
            return magnitude * _FT_TO_M
        return magnitude
    return _float(value)


def _parse_wind(value: Any) -> Optional[dict[str, float]]:
    mapping = _coerce_mapping(value)
    if mapping is None:
        return None
    speed = _float(
        _first_present(mapping, ("speed_mps", "speed", "speedmps", "v"))
    )
    direction = _float(
        _first_present(mapping, ("direction_deg_from", "direction", "from", "heading"))
    )
    target = _float(_first_present(mapping, ("targetAzimuth_deg", "target", "az")))
    if direction is None:
        return None
    return {
        "speed_mps": max(speed or 0.0, 0.0),
        "direction_deg_from": direction % 360,
        "targetAzimuth_deg": target % 360 if target is not None else None,
    }


def _merge_coefficients(config: MutableMapping[str, Any], source: Mapping[str, Any]) -> None:
    coeff = config["coeff"]
    direct_sources = source
    nested = source.get("coeff") if isinstance(source.get("coeff"), Mapping) else None
    if nested:
        direct_sources = {**direct_sources, **nested}
    caps = direct_sources.get("caps")
    if isinstance(caps, Mapping):
        per_component = caps.get("perComponent") or caps.get("per_component")
        total = caps.get("total")
        per_component_value = _float(per_component)
        total_value = _float(total)
        if per_component_value is not None:
            coeff["cap_per_component"] = max(per_component_value, 0.0)
        if total_value is not None:
            coeff["cap_total"] = max(total_value, 0.0)
    key_map = {
        "head_per_mps": "head_per_mps",
        "headpermps": "head_per_mps",
        "headPerMps": "head_per_mps",
        "slope_per_m": "slope_per_m",
        "slopeperm": "slope_per_m",
        "slopePerM": "slope_per_m",
        "cross_aim_deg_per_mps": "cross_aim_deg_per_mps",
        "crossaimdegpermps": "cross_aim_deg_per_mps",
        "crossAimDegPerMps": "cross_aim_deg_per_mps",
        "cap_per_component": "cap_per_component",
        "capPerComponent": "cap_per_component",
        "cap_total": "cap_total",
        "capTotal": "cap_total",
    }
    for key, target in key_map.items():
        value = direct_sources.get(key)
        parsed = _float(value)
        if parsed is not None:
            coeff[target] = parsed if parsed >= 0 else 0.0


def _extract_wind_mapping(source: Any) -> Optional[Mapping[str, Any]]:
    if not isinstance(source, Mapping):
        return None
    if "playsLike" in source and isinstance(source["playsLike"], Mapping):
        nested = _extract_wind_mapping(source["playsLike"])
        if nested is not None:
            return nested
    wind = source.get("wind")
    if isinstance(wind, Mapping):
        return wind
    if _WIND_KEYS & set(source.keys()):
        return source
    return None


def _merge_from_mapping(config: MutableMapping[str, Any], mapping: Optional[Mapping[str, Any]]) -> None:
    if not mapping:
        return
    enable = mapping.get("enabled")
    if isinstance(enable, bool):
        config["enable"] = enable
    wind = _parse_wind(mapping.get("wind") or mapping)
    if wind is not None and (wind["speed_mps"] > 0 or wind["direction_deg_from"] == wind["direction_deg_from"]):
        config["wind"] = wind
    slope_value = mapping.get("slope") if isinstance(mapping.get("slope"), Mapping) else None
    delta_height = _parse_delta_height(slope_value if slope_value is not None else mapping.get("deltaHeight_m"))
    if delta_height is None:
        delta_height = _parse_delta_height(mapping.get("slope"))
    if delta_height is not None:
        config["slope"] = {"deltaHeight_m": delta_height}
    _merge_coefficients(config, mapping)


def _apply_environment(config: MutableMapping[str, Any]) -> None:
    env_enable = coerce_boolish(os.getenv("PLAYS_LIKE_WIND_ENABLED"))
    if env_enable is not None:
        config["enable"] = env_enable
    head = _float(os.getenv("PLAYS_LIKE_WIND_HEAD_PER_MPS"))
    if head is not None:
        config["coeff"]["head_per_mps"] = head
    slope = _float(os.getenv("PLAYS_LIKE_WIND_SLOPE_PER_M"))
    if slope is not None:
        config["coeff"]["slope_per_m"] = slope
    cross = _float(os.getenv("PLAYS_LIKE_WIND_CROSS_AIM_DEG_PER_MPS"))
    if cross is not None:
        config["coeff"]["cross_aim_deg_per_mps"] = cross
    cap_component = _float(os.getenv("PLAYS_LIKE_WIND_CAP_PER_COMPONENT"))
    if cap_component is not None:
        config["coeff"]["cap_per_component"] = max(cap_component, 0.0)
    cap_total = _float(os.getenv("PLAYS_LIKE_WIND_CAP_TOTAL"))
    if cap_total is not None:
        config["coeff"]["cap_total"] = max(cap_total, 0.0)


def _parse_override(value: Any, parser) -> Optional[Any]:
    parsed = parser(value)
    if parsed is not None:
        return parsed
    return None


def _apply_request_overrides(config: MutableMapping[str, Any], request: Request) -> None:
    headers = request.headers
    enable_header = headers.get("x-pl-wind-slope") or headers.get("X-PL-WIND-SLOPE")
    toggle = coerce_boolish(enable_header) if enable_header is not None else None
    if toggle is not None:
        config["enable"] = toggle
    wind_header = headers.get("x-pl-wind") or headers.get("X-PL-WIND")
    wind_override = _parse_override(wind_header, _parse_wind)
    if wind_override is not None:
        config["wind"] = wind_override
    slope_header = headers.get("x-pl-slope") or headers.get("X-PL-SLOPE")
    slope_override = _parse_override(slope_header, _parse_delta_height)
    if slope_override is not None:
        config["slope"] = {"deltaHeight_m": slope_override}

    queries = request.query_params
    enable_query = next(
        (queries[key] for key in ("pl_wind_slope", "pl-wind-slope") if key in queries),
        None,
    )
    if enable_query is not None:
        toggle_query = coerce_boolish(enable_query)
        if toggle_query is not None:
            config["enable"] = toggle_query
    wind_query = next(
        (queries[key] for key in ("pl_wind", "pl-wind") if key in queries),
        None,
    )
    wind_q_override = _parse_override(wind_query, _parse_wind)
    if wind_q_override is not None:
        config["wind"] = wind_q_override
    slope_query = next(
        (queries[key] for key in ("pl_slope", "pl-slope") if key in queries),
        None,
    )
    slope_q_override = _parse_override(slope_query, _parse_delta_height)
    if slope_q_override is not None:
        config["slope"] = {"deltaHeight_m": slope_q_override}


def _sanitize_distance(value: Any) -> float:
    parsed = _float(value)
    if parsed is None or not math.isfinite(parsed) or parsed <= 0:
        return 0.0
    return float(parsed)


def _clamp_with_note(value: float, limit: float, notes: list[str], note: str) -> float:
    if not math.isfinite(value):
        return 0.0
    limit = max(0.0, limit)
    if limit == 0.0:
        return 0.0
    if abs(value) <= limit:
        return value
    if note not in notes:
        notes.append(note)
    return math.copysign(limit, value)


def compute_wind_slope_delta(
    base_distance_m: float, config: WindSlopeConfig
) -> WindSlopeDelta:
    base_distance = _sanitize_distance(base_distance_m)
    if not config.enable or base_distance == 0.0:
        return WindSlopeDelta(0.0, 0.0, 0.0, None, tuple())

    coeff = config.coeff
    cap_per_component = base_distance * max(coeff.cap_per_component, 0.0)
    cap_total = base_distance * max(coeff.cap_total, 0.0)
    notes: list[str] = []

    delta_head = 0.0
    aim_adjust: Optional[float] = None
    wind = config.wind
    if wind and math.isfinite(wind.direction_deg_from):
        speed = max(wind.speed_mps, 0.0)
        direction = wind.direction_deg_from % 360
        target = (wind.target_azimuth_deg or 0.0) % 360
        theta = math.radians((direction - target) % 360)
        head_component = speed * math.cos(theta)
        cross_component = speed * math.sin(theta)
        raw_head = -base_distance * coeff.head_per_mps * head_component
        delta_head = _clamp_with_note(raw_head, cap_per_component, notes, "head_component_capped")
        aim_raw = coeff.cross_aim_deg_per_mps * cross_component
        if math.isfinite(aim_raw) and aim_raw != 0.0:
            aim_adjust = aim_raw

    delta_slope = 0.0
    slope = config.slope
    if slope:
        raw_slope = -coeff.slope_per_m * slope.delta_height_m
        delta_slope = _clamp_with_note(raw_slope, cap_per_component, notes, "slope_component_capped")

    delta_total = delta_head + delta_slope

    if cap_total == 0.0:
        if delta_total != 0.0:
            notes.append("total_capped")
        delta_head = 0.0
        delta_slope = 0.0
        delta_total = 0.0
    elif abs(delta_total) > cap_total:
        scale = cap_total / abs(delta_total)
        delta_head *= scale
        delta_slope *= scale
        delta_total = delta_head + delta_slope
        notes.append("total_capped")

    return WindSlopeDelta(
        delta_head_m=float(delta_head),
        delta_slope_m=float(delta_slope),
        delta_total_m=float(delta_total),
        aim_adjust_deg=float(aim_adjust) if aim_adjust is not None else None,
        notes=tuple(dict.fromkeys(notes)),
    )


def resolveWindSlopeConfig(
    request: Request,
    course: Optional[Mapping[str, Any]] = None,
    user: Optional[Mapping[str, Any]] = None,
) -> WindSlopeConfig:
    config: MutableMapping[str, Any] = {
        "enable": False,
        "wind": None,
        "slope": None,
        "coeff": {
            "head_per_mps": _DEFAULT_HEAD_PER_MPS,
            "slope_per_m": _DEFAULT_SLOPE_PER_M,
            "cross_aim_deg_per_mps": _DEFAULT_CROSS_AIM_DEG_PER_MPS,
            "cap_per_component": _DEFAULT_CAP_PER_COMPONENT,
            "cap_total": _DEFAULT_CAP_TOTAL,
        },
    }

    _apply_environment(config)

    state = getattr(request, "state", None)
    state_sources = [
        getattr(state, "remote_config", None) if state else None,
        getattr(state, "playslike_config", None) if state else None,
        getattr(state, "playslike_wind_slope", None) if state else None,
        getattr(state, "playslike_wind", None) if state else None,
    ]
    for candidate in state_sources:
        mapping = _extract_wind_mapping(candidate)
        if mapping:
            _merge_from_mapping(config, mapping)

    _merge_from_mapping(config, _extract_wind_mapping(course))
    _merge_from_mapping(config, _extract_wind_mapping(user))
    _apply_request_overrides(config, request)

    wind_data = config.get("wind")
    wind = None
    if isinstance(wind_data, Mapping):
        speed = _float(wind_data.get("speed_mps")) or 0.0
        direction = _float(wind_data.get("direction_deg_from"))
        if direction is not None:
            target = _float(wind_data.get("targetAzimuth_deg"))
            wind = WindVector(speed_mps=max(speed, 0.0), direction_deg_from=direction % 360, target_azimuth_deg=(target % 360) if target is not None else None)

    slope_data = config.get("slope")
    slope_setting = None
    if isinstance(slope_data, Mapping):
        delta = _float(slope_data.get("deltaHeight_m"))
        if delta is not None:
            slope_setting = SlopeSetting(delta_height_m=delta)

    coeff = config["coeff"]
    coeffs = WindSlopeCoefficients(
        head_per_mps=float(coeff["head_per_mps"]),
        slope_per_m=float(coeff["slope_per_m"]),
        cross_aim_deg_per_mps=float(coeff["cross_aim_deg_per_mps"]),
        cap_per_component=max(float(coeff["cap_per_component"]), 0.0),
        cap_total=max(float(coeff["cap_total"]), 0.0),
    )

    return WindSlopeConfig(enable=bool(config["enable"]), wind=wind, slope=slope_setting, coeff=coeffs)


__all__ = [
    "WindVector",
    "SlopeSetting",
    "WindSlopeCoefficients",
    "WindSlopeConfig",
    "WindSlopeDelta",
    "compute_wind_slope_delta",
    "resolveWindSlopeConfig",
]
