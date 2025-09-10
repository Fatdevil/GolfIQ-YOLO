import numpy as np
from golfiq_cv.metrics.impact import detect_impact_index
from golfiq_cv.metrics.speed_ext import window_avg_speed_mps


def make_trajs():
    # synthetic: t in s
    t = np.array([-0.03, -0.02, -0.01, 0.00, 0.01, 0.02], dtype=float)
    # club approaches (x increases), passes ball near t=0
    club = np.stack([t, np.linspace(0, 10, len(t)), np.zeros_like(t)], axis=1)
    # ball mostly static then moves after impact
    ball_x = np.array([5, 5, 5, 5, 6.5, 8.0], dtype=float)
    ball = np.stack([t, ball_x, np.zeros_like(t)], axis=1)
    return ball, club


def test_detect_impact_idx():
    ball, club = make_trajs()
    det = detect_impact_index(ball, club)
    assert det["ok"]
    # impact index should be around t=0 which is index 3
    assert abs(det["impact_idx"] - 3) <= 1


def test_window_speeds_nonzero():
    ball, club = make_trajs()
    k = detect_impact_index(ball, club)["impact_idx"]
    v_club = window_avg_speed_mps(club, 0.002, max(0, k - 2), max(0, k))
    v_ball = window_avg_speed_mps(ball, 0.002, k, min(len(ball) - 1, k + 2))
    assert v_club > 0
    assert v_ball > 0
