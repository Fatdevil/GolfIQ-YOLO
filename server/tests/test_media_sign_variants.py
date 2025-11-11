from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_min_ttl_is_clamped_and_signed(monkeypatch) -> None:
    monkeypatch.setenv("HLS_SIGN_KEY", "secret")
    monkeypatch.setenv("HLS_BASE_URL", "https://cdn.example.com")

    response = client.get(
        "/media/sign",
        params={"path": "/hls/abc/master.m3u8", "ttl": "10"},
    )

    assert response.status_code == 200
    url = response.json()["url"]
    assert url.startswith("https://cdn.example.com/hls/abc/master.m3u8")
    assert "sig=" in url and "exp=" in url


def test_max_ttl_is_clamped(monkeypatch) -> None:
    monkeypatch.setenv("HLS_SIGN_KEY", "secret")
    monkeypatch.setenv("HLS_BASE_URL", "/static")

    response = client.get(
        "/media/sign",
        params={"path": "/hls/abc/master.m3u8", "ttl": "999999"},
    )

    assert response.status_code == 200


def test_rejects_invalid_path(monkeypatch) -> None:
    monkeypatch.setenv("HLS_SIGN_KEY", "secret")
    monkeypatch.setenv("HLS_BASE_URL", "/static")

    response = client.get(
        "/media/sign",
        params={"path": "/etc/passwd"},
    )

    assert response.status_code in {400, 422}


def test_missing_key_returns_error(monkeypatch) -> None:
    monkeypatch.delenv("HLS_SIGN_KEY", raising=False)
    monkeypatch.setenv("HLS_BASE_URL", "/static")

    response = client.get(
        "/media/sign",
        params={"path": "/hls/x/master.m3u8"},
    )

    assert response.status_code in {500, 503}
