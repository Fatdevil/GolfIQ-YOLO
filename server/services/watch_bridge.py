"""Bridge helpers for sending watch payloads to paired devices."""

from __future__ import annotations

from server.watch.hud_schemas import HoleHud


def send_hud_to_device(device_id: str, hud: HoleHud) -> bool:
    """Send a HUD snapshot to the given device.

    This is a thin shim to allow tests to stub out the actual transport layer.
    """

    # In production this would enqueue to the platform-specific watch bridge.
    return bool(device_id and hud)


__all__ = ["send_hud_to_device"]
