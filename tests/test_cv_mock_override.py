from __future__ import annotations

import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.config import reset_settings_cache


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _make_zip_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        zf.writestr("frame0.npy", b"0")
        zf.writestr("frame1.npy", b"1")
    return buffer.getvalue()


def _patch_cv(monkeypatch: pytest.MonkeyPatch) -> list[bool]:
    calls: list[bool] = []

    def fake_frames_from_zip(_: bytes) -> list[object]:
        return [object(), object()]

    def fake_analyze_frames(*_: object, mock: bool, **__: object) -> dict:
        calls.append(mock)
        return {"events": [], "metrics": {"confidence": 0.0}}

    monkeypatch.setattr(
        "server.routes.cv_analyze.frames_from_zip_bytes", fake_frames_from_zip
    )
    monkeypatch.setattr(
        "server.routes.cv_analyze.analyze_frames", fake_analyze_frames
    )
    return calls


def _post_analyze(
    client: TestClient,
    *,
    query: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    data: dict[str, str] | None = None,
) -> object:
    files = {"frames_zip": ("frames.zip", _make_zip_bytes(), "application/zip")}
    return client.post(
        "/cv/analyze",
        params=query or {},
        headers=headers or {},
        data=data or {},
        files=files,
    )


def test_cv_analyze_env_default_true_uses_mock(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CV_MOCK", "true")
    reset_settings_cache()
    calls = _patch_cv(monkeypatch)

    response = _post_analyze(client)

    assert response.status_code == 200
    assert calls == [True]
    assert response.headers["x-cv-source"] == "mock"


def test_cv_analyze_env_default_false_uses_real(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CV_MOCK", "false")
    reset_settings_cache()
    calls = _patch_cv(monkeypatch)

    response = _post_analyze(client)

    assert response.status_code == 200
    assert calls == [False]
    assert response.headers["x-cv-source"] == "real"


def test_cv_analyze_query_override_beats_header_and_env(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CV_MOCK", "true")
    reset_settings_cache()
    calls = _patch_cv(monkeypatch)

    response = _post_analyze(
        client,
        query={"mock": "false"},
        headers={"x-cv-mock": "true"},
    )

    assert response.status_code == 200
    assert calls == [False]
    assert response.headers["x-cv-source"] == "real"


def test_cv_analyze_header_override_beats_body_and_env(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CV_MOCK", "false")
    reset_settings_cache()
    calls = _patch_cv(monkeypatch)

    response = _post_analyze(
        client,
        headers={"x-cv-mock": "true"},
        data={"mock": "false"},
    )

    assert response.status_code == 200
    assert calls == [True]
    assert response.headers["x-cv-source"] == "mock"


def test_cv_analyze_body_override_when_env_false(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CV_MOCK", "false")
    reset_settings_cache()
    calls = _patch_cv(monkeypatch)

    response = _post_analyze(client, data={"mock": "true"})

    assert response.status_code == 200
    assert calls == [True]
    assert response.headers["x-cv-source"] == "mock"
