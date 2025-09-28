from __future__ import annotations

from typing import Literal, Optional


Gesture = Literal["tap", "long_press", "swipe_left", "swipe_right"]


class GestureController:
    def __init__(self) -> None:
        self.reticle_position: Optional[tuple[float, float]] = None
        self.target_line_enabled: bool = True
        self.ground_plane_needs_reset: bool = False

    def handle(self, gesture: Gesture, payload: Optional[dict] = None) -> None:
        if gesture == "tap" and payload:
            self.reticle_position = (payload.get("x", 0.0), payload.get("y", 0.0))
        elif gesture == "long_press":
            self.ground_plane_needs_reset = True
        elif gesture.startswith("swipe"):
            self.target_line_enabled = not self.target_line_enabled