"""Tests for join code purge behaviour."""

from server.services.watch_devices import (
    _CODES,
    _now_s,
    _purge_expired_codes,
    mint_join_code,
    reset,
)


def test_purge_keeps_non_expired_codes() -> None:
    reset()
    active = mint_join_code("member-active", ttl_sec=180)
    expiring = mint_join_code("member-expiring", ttl_sec=30)

    # Advance the purge window by 60 seconds: the shorter TTL code should be removed.
    _purge_expired_codes(_now_s() + 60)

    assert active.code in _CODES
    assert expiring.code not in _CODES


def test_purge_removes_already_expired_codes() -> None:
    reset()
    expired = mint_join_code("member-expired", ttl_sec=1)

    # Purge with a timestamp well beyond expiry.
    _purge_expired_codes(_now_s() + 5)

    assert expired.code not in _CODES
