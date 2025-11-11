from __future__ import annotations

import urllib.parse

from fastapi.testclient import TestClient

from server.app import app
from server.services import media_signer


def test_media_sign_route_returns_signed_url(monkeypatch):
    monkeypatch.setenv("HLS_SIGN_KEY", "demo-key")
    monkeypatch.setenv("HLS_BASE_URL", "https://cdn.example.com")
    monkeypatch.setattr(media_signer.time, "time", lambda: 1_700_100_000)

    with TestClient(app) as client:
        response = client.get(
            "/media/sign", params={"path": "/hls/clip/master.m3u8", "ttl": 300}
        )
    assert response.status_code == 200
    payload = response.json()

    expected = media_signer.sign("/hls/clip/master.m3u8", "demo-key", ttl_s=300)
    expected_url = media_signer.build_url("https://cdn.example.com", expected)

    assert payload == {"url": expected_url, "exp": expected["exp"]}


def test_media_sign_route_requires_key(monkeypatch):
    monkeypatch.delenv("HLS_SIGN_KEY", raising=False)

    with TestClient(app) as client:
        response = client.get("/media/sign", params={"path": "/hls/x/master.m3u8"})
    assert response.status_code == 500


def test_media_sign_route_rejects_invalid_path(monkeypatch):
    monkeypatch.setenv("HLS_SIGN_KEY", "demo-key")

    with TestClient(app) as client:
        response = client.get("/media/sign", params={"path": "/static/hls/x.m3u8"})
    assert response.status_code == 400


def test_media_sign_ttl_is_clamped(monkeypatch):
    monkeypatch.setenv("HLS_SIGN_KEY", "secret")
    monkeypatch.setenv("HLS_BASE_URL", "https://cdn.example.com")

    fixed_time = 1_700_200_000
    monkeypatch.setattr(media_signer.time, "time", lambda: fixed_time)

    with TestClient(app) as client:
        response = client.get(
            "/media/sign",
            params={"path": "/hls/clip123/master.m3u8", "ttl": "10"},
        )

    assert response.status_code == 200
    payload = response.json()
    parsed = urllib.parse.urlparse(payload["url"])
    query = urllib.parse.parse_qs(parsed.query)

    assert payload["url"].startswith("https://cdn.example.com/hls/clip123/master.m3u8")
    assert "sig" in query and "exp" in query
    assert int(query["exp"][0]) - fixed_time == 60
