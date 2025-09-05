import sys
import pathlib
import numpy as np
import pytest

# Ensure package path
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from golfiq_cv.metrics.speed import speed_between, last_window_speed_mps
from golfiq_cv.metrics.launch import launch_angle_deg


def test_speed_between():
    assert speed_between((0, 0, 0), (1, 3, 4), 1.0) == 5.0

def test_last_window_speed_mps():
    traj = np.array([[0, 0, 0], [1, 3, 4], [2, 6, 8]])
    assert last_window_speed_mps(traj, 1.0, window=2) == 5.0

def test_launch_angle_deg():
    traj = np.array([[0, 0, 0], [1, 1, -1]])
    assert launch_angle_deg(traj, 1.0) == pytest.approx(45.0)
