import numpy as np

def carry_simple_m(ball_speed_mps: float, launch_deg: float) -> float:
    """Estimate carry distance in meters using basic projectile motion."""
    g = 9.81
    rad = np.deg2rad(launch_deg)
    return float((ball_speed_mps ** 2) * np.sin(2 * rad) / g)
