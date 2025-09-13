from typing import Dict, Tuple

import numpy as np


def _align_by_time(a: np.ndarray, b: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Align two trajectories by nearest timestamp.
    Input arrays: (N,3) [t, x, y]
    Returns matched arrays a2, b2 with the same length and times from 'a'.
    """
    if len(a) == 0 or len(b) == 0:
        return a, b
    if len(b) == 1:
        # fast-path: only one sample in b -> repeat to match a
        return a, np.repeat(b, len(a), axis=0).astype(float)

    bt = b[:, 0]
    # use searchsorted to find nearest timestamp without explicit Python loop
    idx = np.searchsorted(bt, a[:, 0], side="left")
    idx = np.clip(idx, 1, len(bt) - 1)
    left = idx - 1
    right = idx
    choose_left = a[:, 0] - bt[left] <= bt[right] - a[:, 0]
    idx = np.where(choose_left, left, right)
    out_b = b[idx]
    return a, out_b.astype(float)


def detect_impact_index(
    ball: np.ndarray, club: np.ndarray
) -> Dict[str, int | float | bool]:
    """Detect impact as the time where club is closest to ball and ball
    accelerates after.
    Returns dict with:
      - impact_idx (int index into aligned arrays)
      - t_impact (float time seconds)
      - ok (bool)
    Fallback: min-distance only if acceleration check is not possible.
    """
    if len(ball) < 2 or len(club) < 2:
        return {
            "ok": False,
            "impact_idx": max(len(ball), len(club)) - 1,
            "t_impact": ball[-1, 0] if len(ball) else 0.0,
        }
    a_ball, a_club = _align_by_time(ball, club)
    # compute distance per sample
    dx = a_ball[:, 1] - a_club[:, 1]
    dy = a_ball[:, 2] - a_club[:, 2]
    dist = np.hypot(dx, dy)
    k_min = int(np.argmin(dist))

    # simple acceleration cue: ball speed pre vs post around k_min
    def speed_mag(traj):
        if len(traj) < 2:
            return np.zeros(len(traj))
        dt = np.diff(traj[:, 0])
        dt[dt == 0] = 1e-6
        dx = np.diff(traj[:, 1])
        dy = np.diff(traj[:, 2])
        v = np.hypot(dx, dy) / dt
        # align length to traj by appending last value
        return np.concatenate([v, v[-1:]])

    v_ball = speed_mag(a_ball)
    # if ball speed notably increases after k_min → trust this as impact
    pre = np.mean(v_ball[max(0, k_min - 2) : k_min + 1]) if k_min >= 1 else v_ball[0]
    post = (
        np.mean(v_ball[k_min + 1 : min(len(v_ball), k_min + 3)])
        if k_min + 1 < len(v_ball)
        else v_ball[-1]
    )
    if (
        post > pre * 2.0 or post - pre > 1.0
    ):  # arbitrary heuristic in px/s (works on normalized scale)
        idx = k_min
    else:
        idx = k_min  # fallback

    return {"ok": True, "impact_idx": int(idx), "t_impact": float(a_ball[idx, 0])}
