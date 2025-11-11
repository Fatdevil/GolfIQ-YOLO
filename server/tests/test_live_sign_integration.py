from pathlib import Path
from urllib.parse import quote, urlparse

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream
from server.utils import media as media_utils

client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "captain"}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    live_stream.reset()
    monkeypatch.setenv("LIVE_STREAM_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "hls-secret")
    monkeypatch.setenv("HLS_SIGN_KEY", "media-secret")
    monkeypatch.setenv("HLS_BASE_URL", "https://cdn.golfiq.test")
    monkeypatch.setenv("MEDIA_CDN_BASE_URL", "https://edge.golfiq.test")
    monkeypatch.setenv("MEDIA_ORIGIN_BASE_URL", "https://cdn.golfiq.test")
    media_utils.reset_media_url_cache()
    yield
    live_stream.reset()
    media_utils.reset_media_url_cache()


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
    parsed_hls = urlparse(hls_path)
    assert parsed_hls.netloc == "edge.golfiq.test"
    assert parsed_hls.path.startswith("/hls/")

    sign = client.get(f"/media/sign?path={quote(parsed_hls.path)}")
    assert sign.status_code == 200
    signed = sign.json()
    parsed = urlparse(signed["url"])
    assert parsed.netloc == "edge.golfiq.test"
    assert parsed.path.endswith("index.m3u8")
