import numpy as np

def _delta_m(p0, p1, scale_m_per_px: float) -> float:
    dx = (p1[1] - p0[1]) * scale_m_per_px
    dy = (p1[2] - p0[2]) * scale_m_per_px
    return float(np.hypot(dx, dy))

def speed_between(p0, p1, scale_m_per_px: float) -> float:
    dt = float(p1[0] - p0[0])
    if dt <= 0:
        return 0.0
    return _delta_m(p0, p1, scale_m_per_px) / dt

def last_window_speed_mps(traj: np.ndarray, scale_m_per_px: float, window:int=2) -> float:
    """
    traj: array shape (N,3) with [t, x_px, y_px]
    window: number of last intervals to average
    """
    n = len(traj)
    if n < 2:
        return 0.0
    speeds = []
    for i in range(max(0, n-1-window), n-1):
        v = speed_between(traj[i], traj[i+1], scale_m_per_px)
        speeds.append(v)
    if not speeds:
        return 0.0
    return float(np.mean(speeds))
