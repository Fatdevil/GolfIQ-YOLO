import numpy as np

from .speed import speed_between


def window_avg_speed_mps(
    traj: np.ndarray, scale_m_per_px: float, start_idx: int, end_idx: int
) -> float:
    """Average speed over consecutive pairs in [start_idx, end_idx)."""
    n = len(traj)
    if n < 2 or start_idx >= end_idx:
        return 0.0
    start = max(0, start_idx)
    end = min(n - 1, end_idx)
    speeds = []
    for i in range(start, end):
        speeds.append(speed_between(traj[i], traj[i + 1], scale_m_per_px))
    return float(np.mean(speeds)) if speeds else 0.0
