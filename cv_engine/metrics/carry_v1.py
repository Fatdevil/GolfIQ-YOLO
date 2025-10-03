from __future__ import annotations

import math


def estimate_carry(
    ball_speed_mps: float,
    launch_angle_deg: float,
    *,
    drag_k: float = 0.02,
    gravity: float = 9.81,
) -> float:
    """Estimate carry distance with simple ballistic drag adjustment."""

    if ball_speed_mps <= 0:
        return 0.0
    launch_rad = math.radians(launch_angle_deg)
    vx = ball_speed_mps * math.cos(launch_rad)
    vy = ball_speed_mps * math.sin(launch_rad)
    if vx <= 0:
        return 0.0
    # Basic projectile time of flight with drag reduction factor
    time = 2 * vy / gravity if vy > 0 else 0.0
    carry = vx * time
    # Drag penalty approximation (1 - k * v)
    carry *= max(0.0, 1.0 - drag_k * ball_speed_mps)
    return max(carry, 0.0)
