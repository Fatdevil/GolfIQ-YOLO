"""Visibility policy helpers for clips."""

from __future__ import annotations

from server.schemas.moderation import Visibility
from server.services import moderation_repo


def is_clip_public(clip_id: str) -> bool:
    """Return True when the clip is visible to the public feed."""

    state = moderation_repo.get_state(clip_id)
    if state.hidden:
        return False
    return state.visibility is Visibility.public


__all__ = ["is_clip_public"]
