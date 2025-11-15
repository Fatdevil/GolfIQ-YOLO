from __future__ import annotations

import importlib

import server.cv.config as config


def _reload() -> None:
    importlib.reload(config)


def test_backend_defaults_to_mock_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("RANGE_PRACTICE_CV_BACKEND", raising=False)
    _reload()
    assert config.get_range_backend() == config.CvBackend.MOCK


def test_backend_explicit_mock(monkeypatch) -> None:
    monkeypatch.setenv("RANGE_PRACTICE_CV_BACKEND", "mock")
    assert config.get_range_backend() == config.CvBackend.MOCK


def test_backend_real(monkeypatch) -> None:
    monkeypatch.setenv("RANGE_PRACTICE_CV_BACKEND", "real")
    assert config.get_range_backend() == config.CvBackend.REAL


def test_backend_weird_value_falls_back(monkeypatch) -> None:
    monkeypatch.setenv("RANGE_PRACTICE_CV_BACKEND", "sOmEtHiNg")
    assert config.get_range_backend() == config.CvBackend.MOCK


def test_backend_blank_value_falls_back(monkeypatch) -> None:
    monkeypatch.setenv("RANGE_PRACTICE_CV_BACKEND", " ")
    assert config.get_range_backend() == config.CvBackend.MOCK
