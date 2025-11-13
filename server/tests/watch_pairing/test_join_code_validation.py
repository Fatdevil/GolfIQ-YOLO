"""Join code validation coverage."""

import pytest

from server.services.watch_devices import mint_join_code, reset


@pytest.fixture(autouse=True)
def reset_devices() -> None:
    reset()
    yield
    reset()


def test_mint_join_code_rejects_non_positive_ttl() -> None:
    with pytest.raises(ValueError):
        mint_join_code("member-x", ttl_sec=0)
    with pytest.raises(ValueError):
        mint_join_code("member-x", ttl_sec=-10)
