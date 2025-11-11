from server.utils.cdn import to_cdn


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
