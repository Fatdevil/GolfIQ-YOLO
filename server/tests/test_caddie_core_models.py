from __future__ import annotations

import pytest

from server.services.caddie_core import models


def test_player_profile_requires_unique_clubs() -> None:
    with pytest.raises(ValueError):
        models.PlayerProfile(player_id="p1", clubs=["7i", "7i"])
