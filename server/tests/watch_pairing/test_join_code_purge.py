"""Tests for join code purge behaviour."""

from server.services.watch_devices import (
    _CODES,
    _purge_expired_codes,
    mint_join_code,
    reset,
)


def test_purge_keeps_non_expired_codes(timewarp) -> None:
    reset()
    active = mint_join_code("member-active", ttl_sec=180)
    expiring = mint_join_code("member-expiring", ttl_sec=30)

    # Advance 60 seconds; only the short-lived code should expire.
    timewarp(60)
    _purge_expired_codes()

    assert active.code in _CODES
    assert expiring.code not in _CODES


def test_purge_removes_already_expired_codes(timewarp) -> None:
    reset()
    expired = mint_join_code("member-expired", ttl_sec=1)

    # Warp beyond expiry and purge.
    timewarp(5)
    _purge_expired_codes()

    assert expired.code not in _CODES
