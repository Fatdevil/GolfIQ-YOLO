from __future__ import annotations

import hashlib
import json
import math
import os
import threading
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from fastapi import APIRouter, HTTPException, Request, Response, status

from .playslike_wind_config import compute_wind_slope_delta, resolveWindSlopeConfig

DEFAULT_TEMP_ALT_CFG: Dict[str, Any] = {
    "enabled": False,
    "betaPerC": 0.0018,
    "gammaPer100m": 0.0065,
    "caps": {"perComponent": 0.10, "total": 0.20},
}

DEFAULT_WIND_SLOPE_CFG: Dict[str, Any] = {
    "enabled": False,
    "head_per_mps": 0.015,
    "slope_per_m": 0.90,
    "cross_aim_deg_per_mps": 0.35,
    "caps": {"perComponent": 0.15, "total": 0.25},
}


def _sanitize_temp_alt(
    overrides: Any, base: Dict[str, Any] | None = None
) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = deepcopy(DEFAULT_TEMP_ALT_CFG)
    if isinstance(base, dict):
        enabled = base.get("enabled")
        if isinstance(enabled, bool):
            sanitized["enabled"] = enabled
        beta = base.get("betaPerC")
        if isinstance(beta, (int, float)):
            sanitized["betaPerC"] = float(beta)
        gamma = base.get("gammaPer100m")
        if isinstance(gamma, (int, float)):
            sanitized["gammaPer100m"] = float(gamma)
        caps_base = base.get("caps")
        if isinstance(caps_base, dict):
            per_component = caps_base.get("perComponent")
            total = caps_base.get("total")
            if isinstance(per_component, (int, float)):
                sanitized["caps"]["perComponent"] = float(per_component)
            if isinstance(total, (int, float)):
                sanitized["caps"]["total"] = float(total)
    if overrides is None:
        return sanitized
    if not isinstance(overrides, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="playsLike.tempAlt must be a JSON object",
        )
    for key, value in overrides.items():
        if key == "enabled":
            if not isinstance(value, bool):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="playsLike.tempAlt.enabled must be a boolean",
                )
            sanitized["enabled"] = value
        elif key == "betaPerC":
            if not isinstance(value, (int, float)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="playsLike.tempAlt.betaPerC must be a number",
                )
            sanitized["betaPerC"] = float(value)
        elif key == "gammaPer100m":
            if not isinstance(value, (int, float)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="playsLike.tempAlt.gammaPer100m must be a number",
                )
            sanitized["gammaPer100m"] = float(value)
        elif key == "caps":
            if value is None:
                sanitized["caps"] = deepcopy(DEFAULT_TEMP_ALT_CFG["caps"])
                continue
            if not isinstance(value, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="playsLike.tempAlt.caps must be a JSON object",
                )
            per_component = value.get("perComponent")
            if per_component is not None:
                if not isinstance(per_component, (int, float)):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="playsLike.tempAlt.caps.perComponent must be a number",
                    )
                sanitized["caps"]["perComponent"] = float(per_component)
            total = value.get("total")
            if total is not None:
                if not isinstance(total, (int, float)):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="playsLike.tempAlt.caps.total must be a number",
                    )
                sanitized["caps"]["total"] = float(total)
    return sanitized


def _sanitize_wind(
    overrides: Any, base: Dict[str, Any] | None = None
) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = deepcopy(DEFAULT_WIND_SLOPE_CFG)
    if isinstance(base, dict):
        enabled = base.get("enabled")
        if isinstance(enabled, bool):
            sanitized["enabled"] = enabled
        for key in ("head_per_mps", "slope_per_m", "cross_aim_deg_per_mps"):
            value = base.get(key)
            if isinstance(value, (int, float)):
                sanitized[key] = float(value)
        caps_base = base.get("caps")
        if isinstance(caps_base, dict):
            per_component = caps_base.get("perComponent")
            total = caps_base.get("total")
            if isinstance(per_component, (int, float)):
                sanitized["caps"]["perComponent"] = float(per_component)
            if isinstance(total, (int, float)):
                sanitized["caps"]["total"] = float(total)
    if overrides is None:
        return sanitized
    if not isinstance(overrides, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="playsLike.wind must be a JSON object",
        )
    for key, value in overrides.items():
        if key == "enabled":
            if not isinstance(value, bool):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="playsLike.wind.enabled must be a boolean",
                )
            sanitized["enabled"] = value
        elif key in {"head_per_mps", "slope_per_m", "cross_aim_deg_per_mps"}:
            if not isinstance(value, (int, float)):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"playsLike.wind.{key} must be a number",
                )
            sanitized[key] = float(value)
        elif key == "caps":
            if value is None:
                sanitized["caps"] = deepcopy(DEFAULT_WIND_SLOPE_CFG["caps"])
                continue
            if not isinstance(value, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="playsLike.wind.caps must be a JSON object",
                )
            per_component = value.get("perComponent")
            if per_component is not None:
                if not isinstance(per_component, (int, float)):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="playsLike.wind.caps.perComponent must be a number",
                    )
                sanitized["caps"]["perComponent"] = float(per_component)
            total = value.get("total")
            if total is not None:
                if not isinstance(total, (int, float)):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="playsLike.wind.caps.total must be a number",
                    )
                sanitized["caps"]["total"] = float(total)
        else:
            sanitized[key] = value
    return sanitized


def _parse_distance_token(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        parsed = float(value)
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        lowered = stripped.lower()
        if lowered.endswith("m"):
            lowered = lowered[:-1]
        try:
            parsed = float(lowered)
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(parsed) or parsed <= 0:
        return None
    return parsed


DEFAULT_PLAYSLIKE_REMOTE_CFG: Dict[str, Any] = {
    "windModel": "percent_v1",
    "alphaHead_per_mph": 0.01,
    "alphaTail_per_mph": 0.005,
    "slopeFactor": 1.0,
    "windCap_pctOfD": 0.20,
    "taperStart_mph": 20,
    "sidewindDistanceAdjust": False,
    "byClub": {
        "driver": {"scaleHead": 0.9, "scaleTail": 0.9},
        "midIron": {"scaleHead": 1.0, "scaleTail": 1.0},
        "wedge": {"scaleHead": 1.1, "scaleTail": 1.0},
    },
    "byPlayerType": {
        "tour": {"scaleHead": 0.95, "scaleTail": 0.95},
        "amateur": {"scaleHead": 1.05, "scaleTail": 1.0},
    },
    "wind": deepcopy(DEFAULT_WIND_SLOPE_CFG),
    "tempAlt": deepcopy(DEFAULT_TEMP_ALT_CFG),
}

DEFAULT_PLAYSLIKE_PROFILE = "literature_v1"
DEFAULT_UI_CONFIG: Dict[str, str] = {"playsLikeVariant": "off"}


def _sanitize_ui(
    overrides: Any,
    base: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = deepcopy(DEFAULT_UI_CONFIG)
    if isinstance(base, dict):
        variant = base.get("playsLikeVariant")
        if isinstance(variant, str):
            normalized = variant.lower()
            if normalized in {"off", "v1"}:
                sanitized["playsLikeVariant"] = normalized
    if overrides is None:
        return sanitized
    if not isinstance(overrides, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ui must be a JSON object",
        )
    for key, value in overrides.items():
        if key != "playsLikeVariant":
            continue
        if not isinstance(value, str):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ui.playsLikeVariant must be a string",
            )
        normalized = value.lower()
        if normalized not in {"off", "v1"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ui.playsLikeVariant must be one of ['off', 'v1']",
            )
        sanitized["playsLikeVariant"] = normalized
    return sanitized


def _tier_defaults(**overrides: Any) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "hudEnabled": overrides.pop("hudEnabled", False),
        "inputSize": overrides.pop("inputSize", 320),
        "analyticsEnabled": overrides.pop("analyticsEnabled", False),
        "crashEnabled": overrides.pop("crashEnabled", False),
        "reducedRate": overrides.pop("reducedRate", False),
        "playsLikeEnabled": overrides.pop("playsLikeEnabled", False),
        "ui": _sanitize_ui(overrides.pop("ui", None)),
        "playsLikeProfile": overrides.pop(
            "playsLikeProfile", DEFAULT_PLAYSLIKE_PROFILE
        ),
        "playsLikeProfileSelection": overrides.pop(
            "playsLikeProfileSelection",
            {"playerType": None, "clubClass": None},
        ),
        "playsLike": deepcopy(DEFAULT_PLAYSLIKE_REMOTE_CFG),
    }
    data.update(overrides)
    return data


DEFAULT_REMOTE_CONFIG: Dict[str, Dict[str, Any]] = {
    "tierA": _tier_defaults(hudEnabled=True, inputSize=320),
    "tierB": _tier_defaults(hudEnabled=True, inputSize=320, reducedRate=True),
    "tierC": _tier_defaults(hudEnabled=False),
}

BOOL_KEYS = {
    "hudEnabled",
    "hudTracerEnabled",
    "fieldTestMode",
    "reducedRate",
    "analyticsEnabled",
    "crashEnabled",
    "playsLikeEnabled",
}


class RemoteConfigStore:
    """Thread-safe in-memory remote configuration store."""

    def __init__(self, initial: Dict[str, Dict[str, Any]] | None = None) -> None:
        self._lock = threading.RLock()
        self._config: Dict[str, Dict[str, Any]] = deepcopy(
            initial or DEFAULT_REMOTE_CONFIG
        )
        self._etag, self._updated_at = self._compute_metadata(self._config)

    def snapshot(self) -> Tuple[Dict[str, Dict[str, Any]], str, str]:
        with self._lock:
            return deepcopy(self._config), self._etag, self._updated_at

    def update(
        self, new_config: Dict[str, Any]
    ) -> Tuple[Dict[str, Dict[str, Any]], str, str]:
        with self._lock:
            validated = self._validate(new_config, self._config)
            self._config = deepcopy(validated)
            self._etag, self._updated_at = self._compute_metadata(self._config)
            return deepcopy(self._config), self._etag, self._updated_at

    @staticmethod
    def _sanitize_profile_selection(
        overrides: Any, base: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
        sanitized = {"playerType": None, "clubClass": None}
        if isinstance(base, dict):
            for key in sanitized:
                value = base.get(key)
                if value is None or isinstance(value, str):
                    sanitized[key] = value
        if overrides is None:
            return sanitized
        if not isinstance(overrides, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="playsLikeProfileSelection must be a JSON object",
            )
        for key, value in overrides.items():
            if key not in sanitized:
                continue
            if value is not None and not isinstance(value, str):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"playsLikeProfileSelection.{key} must be a string or null",
                )
            sanitized[key] = value
        return sanitized

    @staticmethod
    def _sanitize_plays_like(
        overrides: Any, base: Dict[str, Any] | None = None
    ) -> Dict[str, Any]:
        sanitized: Dict[str, Any] = deepcopy(DEFAULT_PLAYSLIKE_REMOTE_CFG)
        if isinstance(base, dict):
            for key, value in base.items():
                if value is not None and key in sanitized:
                    sanitized[key] = value
        if overrides is None:
            return sanitized
        if not isinstance(overrides, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="playsLike must be a JSON object",
            )
        for key, value in overrides.items():
            if key == "windModel":
                if not isinstance(value, str):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="playsLike.windModel must be a string",
                    )
                sanitized[key] = value
            elif key == "sidewindDistanceAdjust":
                if not isinstance(value, bool):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="playsLike.sidewindDistanceAdjust must be a boolean",
                    )
                sanitized[key] = value
            elif key in {"byClub", "byPlayerType"}:
                if value is None:
                    sanitized[key] = None
                    continue
                if not isinstance(value, dict):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"playsLike.{key} must be a JSON object",
                    )
                sanitized_map: Dict[str, Dict[str, float]] = {}
                for entry, scales in value.items():
                    if not isinstance(scales, dict):
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"playsLike.{key}.{entry} must be a JSON object",
                        )
                    sanitized_entry: Dict[str, float] = {}
                    for scale_key, scale_value in scales.items():
                        if scale_key not in {"scaleHead", "scaleTail"}:
                            continue
                        if scale_value is None:
                            continue
                        if not isinstance(scale_value, (int, float)):
                            raise HTTPException(
                                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=(
                                    f"playsLike.{key}.{entry}.{scale_key} must be a number"
                                ),
                            )
                        sanitized_entry[scale_key] = float(scale_value)
                    if sanitized_entry:
                        sanitized_map[entry] = sanitized_entry
                sanitized[key] = sanitized_map
            elif key == "tempAlt":
                sanitized[key] = _sanitize_temp_alt(value, sanitized.get("tempAlt"))
            elif key == "wind":
                sanitized[key] = _sanitize_wind(value, sanitized.get("wind"))
            elif key in sanitized:
                if not isinstance(value, (int, float)):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"playsLike.{key} must be a number",
                    )
                sanitized[key] = float(value)
            else:
                sanitized[key] = value
        return sanitized

    @classmethod
    def _merge_tier(
        cls,
        tier: str,
        current: Dict[str, Any] | None,
        overrides: Dict[str, Any] | None,
    ) -> Dict[str, Any]:
        base = deepcopy(DEFAULT_REMOTE_CONFIG.get(tier, {}))
        plays_like_existing = current.get("playsLike") if current else None
        base["playsLike"] = cls._sanitize_plays_like(None, plays_like_existing)
        base["playsLikeProfileSelection"] = cls._sanitize_profile_selection(
            None, base.get("playsLikeProfileSelection")
        )
        base["ui"] = _sanitize_ui(None, current.get("ui") if current else None)
        if current:
            for key, value in current.items():
                if key == "playsLike":
                    continue
                if key == "playsLikeProfileSelection":
                    base[key] = cls._sanitize_profile_selection(
                        value, base.get("playsLikeProfileSelection")
                    )
                    continue
                if (
                    key == "playsLikeProfile"
                    and value is not None
                    and not isinstance(value, str)
                ):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"{tier}.playsLikeProfile must be a string",
                    )
                if key == "ui":
                    base[key] = _sanitize_ui(value, base.get("ui"))
                    continue
                base[key] = value
        plays_like_override = overrides.get("playsLike") if overrides else None
        base["playsLike"] = cls._sanitize_plays_like(
            plays_like_override, base.get("playsLike")
        )
        if overrides:
            for key, value in overrides.items():
                if key == "playsLike":
                    continue
                if key == "playsLikeProfile":
                    if value is not None and not isinstance(value, str):
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"{tier}.playsLikeProfile must be a string",
                        )
                    base[key] = value
                    continue
                if key == "playsLikeProfileSelection":
                    base[key] = cls._sanitize_profile_selection(
                        value, base.get("playsLikeProfileSelection")
                    )
                    continue
                if key == "ui":
                    base[key] = _sanitize_ui(value, base.get("ui"))
                    continue
                base[key] = value
        for key, value in list(base.items()):
            if key in BOOL_KEYS and value is not None and not isinstance(value, bool):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{tier}.{key} must be a boolean",
                )
            if key == "inputSize" and value is not None and not isinstance(value, int):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{tier}.inputSize must be an integer",
                )
        return base

    @classmethod
    def _validate(
        cls,
        data: Dict[str, Any],
        current: Dict[str, Dict[str, Any]] | None,
    ) -> Dict[str, Dict[str, Any]]:
        if not isinstance(data, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="remote config must be a JSON object",
            )
        allowed_tiers = {"tierA", "tierB", "tierC"}
        unexpected = [tier for tier in data.keys() if tier not in allowed_tiers]
        if unexpected:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"unsupported tier: {unexpected[0]}",
            )
        snapshot = deepcopy(current or DEFAULT_REMOTE_CONFIG)
        validated: Dict[str, Dict[str, Any]] = {}
        for tier in allowed_tiers:
            tier_overrides = data.get(tier)
            if tier_overrides is not None and not isinstance(tier_overrides, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{tier} overrides must be a JSON object",
                )
            validated[tier] = cls._merge_tier(
                tier,
                snapshot.get(tier),
                tier_overrides,
            )
        return validated

    @staticmethod
    def _compute_metadata(config: Dict[str, Dict[str, Any]]) -> Tuple[str, str]:
        canonical = json.dumps(config, sort_keys=True, separators=(",", ":"))
        etag = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        updated_at = datetime.now(timezone.utc).isoformat()
        return etag, updated_at


_store = RemoteConfigStore()
router = APIRouter(prefix="/config", tags=["remote-config"])


def _require_admin(request: Request) -> None:
    expected = os.getenv("ADMIN_TOKEN")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin token not configured",
        )
    provided = request.headers.get("x-admin-token")
    if not provided or provided != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid admin token",
        )
    origin = request.headers.get("origin")
    if origin:
        base = f"{request.url.scheme}://{request.url.netloc}"
        if origin.rstrip("/") != base.rstrip("/"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="cross-origin POSTs are not permitted",
            )


@router.get("/remote")
async def get_remote_config(request: Request) -> Response:
    config, etag, updated_at = _store.snapshot()
    wind_cfg = resolveWindSlopeConfig(request)
    debug_payload: Dict[str, Any] | None = None
    if wind_cfg.enable:
        header_distance = _parse_distance_token(
            request.headers.get("x-pl-distance") or request.headers.get("X-PL-DISTANCE")
        )
        query_distance = None
        for key in ("pl_distance", "pl-base-distance", "pl_base_distance"):
            if key in request.query_params:
                query_distance = _parse_distance_token(request.query_params.get(key))
                if query_distance is not None:
                    break
        base_distance = header_distance or query_distance
        if base_distance is not None:
            delta = compute_wind_slope_delta(base_distance, wind_cfg)
            wind_input = None
            if wind_cfg.wind:
                wind_input = {
                    "speed_mps": wind_cfg.wind.speed_mps,
                    "direction_deg_from": wind_cfg.wind.direction_deg_from,
                }
                if wind_cfg.wind.target_azimuth_deg is not None:
                    wind_input["targetAzimuth_deg"] = wind_cfg.wind.target_azimuth_deg
            slope_input = None
            if wind_cfg.slope:
                slope_input = {"deltaHeight_m": wind_cfg.slope.delta_height_m}
            debug_payload = {
                "playsLike": {
                    "windSlope": {
                        "baseDistance_m": base_distance,
                        "deltaHead_m": delta.delta_head_m,
                        "deltaSlope_m": delta.delta_slope_m,
                        "deltaTotal_m": delta.delta_total_m,
                        "aimAdjust_deg": delta.aim_adjust_deg,
                        "notes": list(delta.notes),
                        "inputs": {
                            "wind": wind_input,
                            "slope": slope_input,
                            "coeff": {
                                "head_per_mps": wind_cfg.coeff.head_per_mps,
                                "slope_per_m": wind_cfg.coeff.slope_per_m,
                                "cross_aim_deg_per_mps": wind_cfg.coeff.cross_aim_deg_per_mps,
                                "cap_per_component": wind_cfg.coeff.cap_per_component,
                                "cap_total": wind_cfg.coeff.cap_total,
                            },
                        },
                    }
                }
            }
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED, headers={"ETag": etag}
        )
    payload: Dict[str, Any] = {"config": config, "etag": etag, "updatedAt": updated_at}
    if debug_payload:
        payload["debug"] = debug_payload
    body = json.dumps(payload)
    return Response(
        content=body,
        media_type="application/json",
        headers={"ETag": etag, "Cache-Control": "no-cache"},
    )


@router.post("/remote")
async def update_remote_config(request: Request) -> Response:
    _require_admin(request)
    try:
        payload = await request.json()
    except Exception as exc:  # pragma: no cover - FastAPI already validates JSON
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid json payload"
        ) from exc
    config, etag, updated_at = _store.update(payload)
    body = json.dumps({"config": config, "etag": etag, "updatedAt": updated_at})
    return Response(
        content=body,
        media_type="application/json",
        headers={"ETag": etag, "Cache-Control": "no-cache"},
    )


__all__ = ["router", "RemoteConfigStore", "DEFAULT_REMOTE_CONFIG"]
