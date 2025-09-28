from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

SAFE_FOV_RATIO = 0.08


@dataclass
class Overlay:
    kind: str
    payload: Dict[str, object]


@dataclass
class HudState:
    overlays: List[Overlay] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class HudCompositor:
    def __init__(self) -> None:
        self._state = HudState()

    def compose(self, data: Dict[str, object]) -> HudState:
        overlays: List[Overlay] = []
        if data.get("reticle"):
            overlays.append(
                Overlay(kind="reticle", payload={"position": data["reticle"]})
            )
        if targets := data.get("targets"):
            for target in targets:
                overlays.append(Overlay(kind="target", payload=target))
        if data.get("wind_tier"):
            overlays.append(
                Overlay(kind="wind_hint", payload={"tier": data["wind_tier"]})
            )
        if data.get("offline"):
            overlays.append(Overlay(kind="offline_badge", payload={}))
        if data.get("fallback"):
            overlays.append(Overlay(kind="compass_mode", payload={}))
        warnings: List[str] = []
        if data.get("fov_ratio", SAFE_FOV_RATIO) > SAFE_FOV_RATIO:
            warnings.append("center_fov_blocked")
        self._state = HudState(overlays=overlays, warnings=warnings)
        return self._state

    @property
    def state(self) -> HudState:
        return self._state
