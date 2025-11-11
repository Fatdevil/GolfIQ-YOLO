"""Unit tests covering helper functions used by the home feed route."""

from datetime import datetime, timezone

import pytest

from server.routes import feed as feed_routes
from server.utils import media as media_utils


@pytest.fixture(autouse=True)
def reset_media_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MEDIA_CDN_BASE_URL", raising=False)
    monkeypatch.delenv("MEDIA_ORIGIN_BASE_URL", raising=False)
    media_utils.reset_media_url_cache()
    yield
    media_utils.reset_media_url_cache()


def test_ensure_float_handles_none_and_invalid() -> None:
    assert feed_routes._ensure_float(None) is None
    assert feed_routes._ensure_float("not-a-number") is None
    assert feed_routes._ensure_float(float("nan")) is None
    assert feed_routes._ensure_float("3.5") == pytest.approx(3.5)


def test_ensure_int_handles_none_and_invalid() -> None:
    assert feed_routes._ensure_int(None) == 0
    assert feed_routes._ensure_int("not-int") == 0
    assert feed_routes._ensure_int(7.2) == 7


def test_format_timestamp_supports_multiple_inputs() -> None:
    aware = datetime(2024, 1, 1, 12, 30, 0, tzinfo=timezone.utc)
    naive = datetime(2024, 1, 1, 12, 30, 0)
    assert feed_routes._format_timestamp(None) is None
    assert feed_routes._format_timestamp(aware) == "2024-01-01T12:30:00Z"
    assert feed_routes._format_timestamp(1704112200) == "2024-01-01T12:30:00Z"
    assert (
        feed_routes._format_timestamp("2024-01-01T12:30:00Z") == "2024-01-01T12:30:00Z"
    )
    assert feed_routes._format_timestamp(object()) is None
    assert feed_routes._format_timestamp(naive) == "2024-01-01T12:30:00Z"


def test_resolve_anchor_prefers_iterable_then_keys() -> None:
    entry_with_list = {"anchors": ["2.5", "7.0"]}
    assert feed_routes._resolve_anchor(entry_with_list) == pytest.approx(2.5)

    entry_with_negative = {"anchorsSec": [-3, 1]}
    assert feed_routes._resolve_anchor(entry_with_negative) == pytest.approx(0.0)

    entry_with_keys = {"anchor_sec": "5", "impact_offset_sec": "9"}
    assert feed_routes._resolve_anchor(entry_with_keys) == pytest.approx(5.0)

    assert feed_routes._resolve_anchor({}) == pytest.approx(0.0)


def test_serialize_top_shot_validates_fields() -> None:
    assert feed_routes._serialize_top_shot({}) is None

    entry = {
        "id": 123,
        "event_id": 789,
        "score": "2.5",
        "sg_delta": "1.2",
        "reactions_1min": "4",
        "reactions_total": "10",
        "created_at": datetime(2024, 1, 1, 12, 30, 0),
        "anchorSec": "3",
    }
    serialized = feed_routes._serialize_top_shot(entry)
    assert serialized is not None
    assert serialized["clipId"] == "123"
    assert serialized["eventId"] == "789"
    assert serialized["sgDelta"] == pytest.approx(1.2)
    assert serialized["reactions1min"] == 4
    assert serialized["reactionsTotal"] == 10
    assert serialized["anchorSec"] == pytest.approx(3.0)
    assert "thumbUrl" in serialized
    assert serialized["thumbUrl"] is None
