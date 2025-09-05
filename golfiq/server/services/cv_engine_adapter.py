# Thin adapter so server can call cv-engine without heavy deps
from golfiq_cv.metrics.speed import last_window_speed_mps
from golfiq_cv.metrics.speed_ext import window_avg_speed_mps
from golfiq_cv.metrics.launch import launch_angle_deg
from golfiq_cv.metrics.carry import carry_simple_m
from golfiq_cv.metrics.impact import detect_impact_index

def compute_metrics(ball, club, scale_m_per_px: float):
    # ball, club: np.ndarray shape (N,3) with [t, x_px, y_px]
    import numpy as np
    ball = np.asarray(ball, dtype=float)
    club = np.asarray(club, dtype=float)

    # detect impact index on pixel space (time-aligned inside)
    det = detect_impact_index(ball, club)
    k = det.get("impact_idx", max(len(ball), len(club))-1)

    # speeds around impact
    club_speed = window_avg_speed_mps(club, scale_m_per_px, max(0, k-2), max(0, k))  # pre-impact window
    ball_speed = window_avg_speed_mps(ball, scale_m_per_px, k, min(len(ball)-1, k+2)) # post-impact window
    # fallback if zero (e.g., poor input)
    if club_speed == 0.0:
        club_speed = last_window_speed_mps(club, scale_m_per_px, window=2)
    if ball_speed == 0.0:
        ball_speed = last_window_speed_mps(ball, scale_m_per_px, window=2)

    launch = launch_angle_deg(ball, scale_m_per_px)
    carry = carry_simple_m(ball_speed, launch)
    return {
        "club_speed_mps": float(club_speed),
        "ball_speed_mps": float(ball_speed),
        "launch_deg": float(launch),
        "carry_m": float(carry),
    }
