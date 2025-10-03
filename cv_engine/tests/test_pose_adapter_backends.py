from __future__ import annotations

import numpy as np

from cv_engine.pose.adapter import PoseAdapter
from cv_engine.pose.mediapipe_backend import MEDIAPIPE_JOINTS
from cv_engine.pose.movenet_backend import MOVENET_JOINTS


def test_mediapipe_backend(monkeypatch):
    monkeypatch.setenv("POSE_BACKEND", "mediapipe")
    adapter = PoseAdapter()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = adapter.detect(frame)
    assert adapter.is_enabled()
    assert set(result.keys()) == set(MEDIAPIPE_JOINTS)


def test_movenet_backend(monkeypatch):
    monkeypatch.setenv("POSE_BACKEND", "movenet")
    adapter = PoseAdapter()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = adapter.detect(frame)
    assert adapter.is_enabled()
    assert set(result.keys()) == set(MOVENET_JOINTS)


def test_disabled_backend(monkeypatch):
    monkeypatch.setenv("POSE_BACKEND", "none")
    adapter = PoseAdapter()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = adapter.detect(frame)
    assert result == {}
    assert not adapter.is_enabled()
