from server.utils.cdn import to_cdn
from server.utils.media import rewrite_media_url, reset_media_url_cache


def _configure_media_env(
    monkeypatch,
    *,
    cdn="https://cdn.example.com",
    origin="https://origin.example.com",
    allow_hosts: str | None = None,
) -> None:
    if cdn is None:
        monkeypatch.delenv("MEDIA_CDN_BASE_URL", raising=False)
    else:
        monkeypatch.setenv("MEDIA_CDN_BASE_URL", cdn)

    if origin is None:
        monkeypatch.delenv("MEDIA_ORIGIN_BASE_URL", raising=False)
    else:
        monkeypatch.setenv("MEDIA_ORIGIN_BASE_URL", origin)

    if allow_hosts is None:
        monkeypatch.delenv("MEDIA_CDN_REWRITE_HOSTS", raising=False)
    else:
        monkeypatch.setenv("MEDIA_CDN_REWRITE_HOSTS", allow_hosts)

    reset_media_url_cache()


def test_to_cdn_rewrites_scheme_and_host() -> None:
    source = "https://origin.example.com/hls/clip/master.m3u8?sig=abc"
    rewritten = to_cdn(source, "https://cdn.example.com")
    assert rewritten == "https://cdn.example.com/hls/clip/master.m3u8?sig=abc"


def test_to_cdn_preserves_path_for_relative_input() -> None:
    source = "/hls/clip/index.m3u8"
    rewritten = to_cdn(source, "https://cdn.example.com")
    assert rewritten == "https://cdn.example.com/hls/clip/index.m3u8"


def test_to_cdn_identity_when_missing_base() -> None:
    source = "https://origin.example.com/hls/clip/master.m3u8"
    assert to_cdn(source, None) == source


def test_relative_url_rewrites_to_cdn(monkeypatch) -> None:
    _configure_media_env(monkeypatch)
    rewritten = rewrite_media_url("/media/clip/master.m3u8")
    assert rewritten == "https://cdn.example.com/media/clip/master.m3u8"


def test_origin_absolute_rewrites_and_keeps_query(monkeypatch) -> None:
    _configure_media_env(monkeypatch)
    rewritten = rewrite_media_url(
        "https://origin.example.com/media/clip/master.m3u8?sig=abc"
    )
    assert rewritten == "https://cdn.example.com/media/clip/master.m3u8?sig=abc"


def test_third_party_absolute_is_not_rewritten(monkeypatch) -> None:
    _configure_media_env(monkeypatch)
    url = "https://imgur.com/a.jpg"
    assert rewrite_media_url(url) == url


def test_data_and_blob_schemes_are_not_rewritten(monkeypatch) -> None:
    _configure_media_env(monkeypatch)
    data_url = "data:image/png;base64,abc"
    blob_url = "blob:https://example.com/media"
    assert rewrite_media_url(data_url) == data_url
    assert rewrite_media_url(blob_url) == blob_url


def test_allowlist_host_is_rewritten_when_env_set(monkeypatch) -> None:
    _configure_media_env(monkeypatch, allow_hosts="files.example.com")
    url = "https://files.example.com/media/clip/master.m3u8"
    rewritten = rewrite_media_url(url)
    assert rewritten == "https://cdn.example.com/media/clip/master.m3u8"
