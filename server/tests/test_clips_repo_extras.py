from __future__ import annotations

from server.services import clips_repo


def test_register_clip_converts_iterable_anchors(monkeypatch) -> None:
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    clips_repo.register_clip({"id": "clip-iter", "anchors": (1.2, 3.4)})

    stored = clips_repo.get_clip("clip-iter")
    assert stored["anchors"] == [1.2, 3.4]


def test_register_clip_handles_non_iterable_anchor(monkeypatch) -> None:
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    clips_repo.register_clip({"id": "clip-single", "anchors": 3.5})

    stored = clips_repo.get_clip("clip-single")
    assert stored["anchors"] == [3.5]


def test_list_for_event_skips_missing_event(monkeypatch) -> None:
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    clips_repo.register_clip({"id": "clip-a", "event_id": "evt-a"})
    clips_repo.register_clip({"id": "clip-b"})

    matches = list(clips_repo.list_for_event("evt-a"))
    assert len(matches) == 1 and matches[0]["id"] == "clip-a"


def test_to_public_handles_invalid_sg(monkeypatch) -> None:
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    payload = {
        "id": "clip-sg",
        "sg_delta": "not-a-float",
        "anchors": ["5", "invalid"],
    }
    public = clips_repo.to_public(payload)
    assert public["sgDelta"] is None
    assert public["anchors"] == [5.0]


def test_update_metrics_casts_values(monkeypatch) -> None:
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    clips_repo.update_metrics("clip-metrics", sg_delta=0.75, anchors=["2.0", 4])

    stored = clips_repo.get_clip("clip-metrics")
    assert stored["sg_delta"] == 0.75
    assert stored["anchors"] == [2.0, 4.0]


def test_is_number_rejects_invalid() -> None:
    assert clips_repo._is_number("not-a-number") is False
