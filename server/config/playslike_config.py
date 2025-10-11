from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping, Optional

from fastapi import Request

from . import coerce_boolish

_TEMP_PATTERN = re.compile(r"^\s*([-+]?\d+(?:\.\d+)?)\s*([cCfF])\s*$")
_ALT_PATTERN = re.compile(r"^\s*([-+]?\d+(?:\.\d+)?)\s*(m|ft)\s*$", re.IGNORECASE)

_DEFAULT_BETA = 0.0018
_DEFAULT_GAMMA = 0.0065
_DEFAULT_CAPS = {"perComponent": 0.10, "total": 0.20}


@dataclass(frozen=True)
class Measurement:
    value: float
    unit: str


@dataclass(frozen=True)
class TempAltConfig:
    enable: bool
    temperature: Optional[Measurement]
    altitudeASL: Optional[Measurement]
    betaPerC: float
    gammaPer100m: float
    caps: dict[str, float]


def _float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and value == value:
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError:
            return None
        if parsed == parsed:
            return parsed
    return None


def _parse_measurement(value: Any, allowed_units: set[str]) -> Optional[Measurement]:
    target_units = {unit.lower() for unit in allowed_units}
    if isinstance(value, Mapping):
        raw = _float(value.get("value"))
        unit = value.get("unit")
        if raw is None or not isinstance(unit, str):
            return None
        normalized = unit.strip().lower()
        if normalized not in target_units:
            return None
        if normalized in {"c", "f"}:
            return Measurement(raw, normalized.upper())
        if normalized == "m":
            return Measurement(raw, "m")
        if normalized == "ft":
            return Measurement(raw, "ft")
        return None
    if isinstance(value, str):
        pattern = _TEMP_PATTERN if target_units == {"c", "f"} else _ALT_PATTERN
        match = pattern.match(value)
        if not match:
            return None
        raw = float(match.group(1))
        unit = match.group(2).strip().lower()
        if unit not in target_units:
            return None
        if unit == "m":
            return Measurement(raw, "m")
        if unit == "ft":
            return Measurement(raw, "ft")
        if unit in {"c", "f"}:
            return Measurement(raw, unit.upper())
        return None
    return None


def _extract_temp_alt_mapping(source: Any) -> Optional[Mapping[str, Any]]:
    if not isinstance(source, Mapping):
        return None
    if "tempAlt" in source and isinstance(source["tempAlt"], Mapping):
        return source["tempAlt"]
    if "playsLike" in source and isinstance(source["playsLike"], Mapping):
        nested = _extract_temp_alt_mapping(source["playsLike"])
        if nested is not None:
            return nested
    expected_keys = {"enabled", "betaPerC", "gammaPer100m", "caps"}
    if expected_keys & set(source.keys()):
        return source
    return None


def _merge_from_mapping(
    config: MutableMapping[str, Any], mapping: Optional[Mapping[str, Any]]
) -> None:
    if not mapping:
        return
    enabled = mapping.get("enabled")
    if isinstance(enabled, bool):
        config["enable"] = enabled
    beta = _float(mapping.get("betaPerC"))
    if beta is not None:
        config["betaPerC"] = beta
    gamma = _float(mapping.get("gammaPer100m"))
    if gamma is not None:
        config["gammaPer100m"] = gamma
    caps = mapping.get("caps")
    if isinstance(caps, Mapping):
        per_component = _float(caps.get("perComponent"))
        if per_component is not None:
            config["caps"]["perComponent"] = per_component
        total = _float(caps.get("total"))
        if total is not None:
            config["caps"]["total"] = total
    temperature = _parse_measurement(mapping.get("temperature"), {"C", "F"})
    if temperature is not None or "temperature" in mapping:
        config["temperature"] = temperature
    altitude = _parse_measurement(
        mapping.get("altitudeASL") or mapping.get("altitude"),
        {"m", "ft"},
    )
    if altitude is not None or "altitudeASL" in mapping or "altitude" in mapping:
        config["altitudeASL"] = altitude


def _apply_environment(config: MutableMapping[str, Any]) -> None:
    env_enable = coerce_boolish(os.getenv("PLAYS_LIKE_TEMPALT_ENABLED"))
    if env_enable is not None:
        config["enable"] = env_enable
    beta = _float(os.getenv("PLAYS_LIKE_TEMPALT_BETA_PER_C"))
    if beta is not None:
        config["betaPerC"] = beta
    gamma = _float(os.getenv("PLAYS_LIKE_TEMPALT_GAMMA_PER_100M"))
    if gamma is not None:
        config["gammaPer100m"] = gamma
    cap_component = _float(os.getenv("PLAYS_LIKE_TEMPALT_CAP_PER_COMPONENT"))
    if cap_component is not None:
        config["caps"]["perComponent"] = cap_component
    cap_total = _float(os.getenv("PLAYS_LIKE_TEMPALT_CAP_TOTAL"))
    if cap_total is not None:
        config["caps"]["total"] = cap_total


def _apply_request_overrides(
    config: MutableMapping[str, Any], request: Request
) -> None:
    headers = request.headers
    temp_header = headers.get("x-pl-temp") or headers.get("X-PL-TEMP")
    measurement = _parse_measurement(temp_header, {"C", "F"}) if temp_header else None
    if measurement is not None:
        config["temperature"] = measurement
    alt_header = headers.get("x-pl-alt") or headers.get("X-PL-ALT")
    altitude = _parse_measurement(alt_header, {"m", "ft"}) if alt_header else None
    if altitude is not None:
        config["altitudeASL"] = altitude
    enable_header = headers.get("x-pl-tempalt") or headers.get("X-PL-TEMPALT")
    header_toggle = coerce_boolish(enable_header) if enable_header is not None else None
    if header_toggle is not None:
        config["enable"] = header_toggle

    queries = request.query_params
    temp_query = next(
        (queries[key] for key in ("pl_temp", "pl-temp", "plTemp") if key in queries),
        None,
    )
    if temp_query:
        measurement = _parse_measurement(temp_query, {"C", "F"})
        if measurement is not None:
            config["temperature"] = measurement
    alt_query = next(
        (queries[key] for key in ("pl_alt", "pl-alt", "plAlt") if key in queries), None
    )
    if alt_query:
        altitude = _parse_measurement(alt_query, {"m", "ft"})
        if altitude is not None:
            config["altitudeASL"] = altitude
    enable_query = next(
        (
            queries[key]
            for key in ("pl_tempalt", "pl-tempalt", "plTempAlt")
            if key in queries
        ),
        None,
    )
    if enable_query is not None:
        query_toggle = coerce_boolish(enable_query)
        if query_toggle is not None:
            config["enable"] = query_toggle


def resolveTempAltConfig(
    request: Request,
    course: Optional[Mapping[str, Any]] = None,
    user: Optional[Mapping[str, Any]] = None,
) -> TempAltConfig:
    config: MutableMapping[str, Any] = {
        "enable": False,
        "temperature": None,
        "altitudeASL": None,
        "betaPerC": _DEFAULT_BETA,
        "gammaPer100m": _DEFAULT_GAMMA,
        "caps": {
            "perComponent": _DEFAULT_CAPS["perComponent"],
            "total": _DEFAULT_CAPS["total"],
        },
    }

    _apply_environment(config)

    state = getattr(request, "state", None)
    state_candidates = [
        getattr(state, "playslike_tempalt", None) if state else None,
        getattr(state, "playslike_config", None) if state else None,
        getattr(state, "remote_config", None) if state else None,
    ]
    for candidate in state_candidates:
        mapping = _extract_temp_alt_mapping(candidate)
        if mapping:
            _merge_from_mapping(config, mapping)
            break

    _merge_from_mapping(config, _extract_temp_alt_mapping(course))
    _merge_from_mapping(config, _extract_temp_alt_mapping(user))
    _apply_request_overrides(config, request)

    return TempAltConfig(
        enable=bool(config["enable"]),
        temperature=config.get("temperature"),
        altitudeASL=config.get("altitudeASL"),
        betaPerC=float(config["betaPerC"]),
        gammaPer100m=float(config["gammaPer100m"]),
        caps={
            "perComponent": float(config["caps"]["perComponent"]),
            "total": float(config["caps"]["total"]),
        },
    )


__all__ = ["Measurement", "TempAltConfig", "resolveTempAltConfig"]
