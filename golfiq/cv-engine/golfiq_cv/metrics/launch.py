import numpy as np
from math import atan2, degrees

def launch_angle_deg(ball_traj, scale_m_per_px: float) -> float:
    """
    Approximera launch-vinkel från första rörelsestegen.
    ball_traj: np.ndarray med [t, x_px, y_px]
    Antag y_px minskar uppåt i bilden; vi tar vektor från första två steg.
    """
    if len(ball_traj) < 2:
        return 0.0
    p0, p1 = ball_traj[-2], ball_traj[-1]
    dx = (p1[1] - p0[1]) * scale_m_per_px
    dy = (p0[2] - p1[2]) * scale_m_per_px  # uppåt positiv
    angle = degrees(atan2(dy, max(dx, 1e-9)))
    return float(angle)
