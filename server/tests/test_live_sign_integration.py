from pathlib import Path
from urllib.parse import quote, urlparse

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream

client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "captain"}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    live_stream.reset()
    monkeypatch.setenv("LIVE_STREAM_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "hls-secret")
    monkeypatch.setenv("HLS_SIGN_KEY", "media-secret")
    monkeypatch.setenv("HLS_BASE_URL", "https://cdn.golfiq.test")
    yield
    live_stream.reset()


def test_status_media_sign_chain() -> None:
    start = client.post("/events/play/live/start", headers=ADMIN_HEADERS)
    assert start.status_code == 200

    minted = client.post("/events/play/live/token", headers=ADMIN_HEADERS)
    assert minted.status_code == 200
    token = minted.json()["token"]

    status = client.get(f"/events/play/live/status?token={token}")
    assert status.status_code == 200
    payload = status.json()
    assert payload["running"] is True
    hls_path = payload["hlsPath"]
    assert hls_path.startswith("/hls/")

    sign = client.get(f"/media/sign?path={quote(hls_path)}")
    assert sign.status_code == 200
    signed = sign.json()
    assert signed["url"].startswith("https://cdn.golfiq.test")
    parsed = urlparse(signed["url"])
    assert parsed.path.endswith("index.m3u8")
