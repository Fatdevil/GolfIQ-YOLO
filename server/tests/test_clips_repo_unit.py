import pytest

from server.services import clips_repo
from server.utils import media as media_utils


@pytest.fixture(autouse=True)
def reset_clip_store():
    clips_repo._CLIP_STORE.clear()
    yield
    clips_repo._CLIP_STORE.clear()


@pytest.fixture(autouse=True)
def reset_media_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MEDIA_CDN_BASE_URL", raising=False)
    monkeypatch.delenv("MEDIA_ORIGIN_BASE_URL", raising=False)
    media_utils.reset_media_url_cache()
    yield
    media_utils.reset_media_url_cache()


def test_register_requires_id():
    with pytest.raises(ValueError):
        clips_repo.register_clip({"id": ""})


def test_register_and_get_clip():
    record = {
        "id": "clip-1",
        "event_id": "event-1",
        "video_url": "https://cdn/clip.mp4",
    }
    clips_repo.register_clip(record)

    fetched = clips_repo.get_clip("clip-1")
    assert fetched["event_id"] == "event-1"
    assert fetched is not record  # defensive copy


def test_get_clip_missing_raises():
    with pytest.raises(clips_repo.ClipNotFoundError):
        clips_repo.get_clip("missing")


def test_update_ai_commentary_persists_fields():
    clips_repo.update_ai_commentary(
        "clip-2",
        title="Walk-off",
        summary="Hole-out for the win",
        tts_url="https://cdn/tts.mp3",
    )
    clip = clips_repo.get_clip("clip-2")
    assert clip["ai_title"] == "Walk-off"
    assert clip["ai_summary"] == "Hole-out for the win"
    assert clip["ai_tts_url"] == "https://cdn/tts.mp3"


def test_to_public_handles_snake_and_camel():
    record = {
        "id": "clip-3",
        "event_id": "event-2",
        "playerName": "Linn",
        "video_url": "https://cdn/video.mp4",
        "thumbnailUrl": "https://cdn/thumb.jpg",
        "createdAt": "2025-01-01T00:00:00Z",
        "ai_title": "Big putt",
        "aiSummary": "Drops the 20 footer.",
        "aiTtsUrl": "https://cdn/voice.mp3",
    }
    public = clips_repo.to_public(record)
    assert public["aiTitle"] == "Big putt"
    assert public["aiSummary"] == "Drops the 20 footer."
    assert public["aiTtsUrl"] == "https://cdn/voice.mp3"


def test_to_public_rewrites_media_with_cdn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEDIA_CDN_BASE_URL", "https://cdn.example")
    monkeypatch.setenv("MEDIA_ORIGIN_BASE_URL", "https://origin.example")
    media_utils.reset_media_url_cache()

    record = {
        "id": "clip-7",
        "event_id": "evt-7",
        "video_url": "/hls/evt-7/master.m3u8",
        "created_at": "2025-02-02T12:00:00Z",
    }

    public = clips_repo.to_public(record)
    assert public["videoUrl"] == "https://cdn.example/hls/evt-7/master.m3u8"
    assert public["thumbUrl"] == "https://cdn.example/hls/evt-7/thumb.jpg"
    assert public["thumbnailUrl"] == public["thumbUrl"]


def test_list_for_event_filters_records():
    clips_repo.register_clip(
        {
            "id": "clip-a",
            "event_id": "event-a",
            "video_url": "https://cdn/clip-a.mp4",
        }
    )
    clips_repo.register_clip(
        {
            "id": "clip-b",
            "event_id": "event-b",
            "video_url": "https://cdn/clip-b.mp4",
        }
    )

    items = list(clips_repo.list_for_event("event-a"))
    assert len(items) == 1
    assert items[0]["id"] == "clip-a"
