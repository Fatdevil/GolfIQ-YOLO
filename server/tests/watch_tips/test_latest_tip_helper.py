from concurrent.futures import ThreadPoolExecutor

from server.services.watch_tip_bus import (
    Tip,
    clear,
    get_latest_tip_for_member,
    publish,
)


def test_get_latest_tip_returns_last_published() -> None:
    member_id = "mem-1"
    clear(member_id)

    publish(
        member_id,
        Tip(
            tipId="t1",
            title="First",
            body="1",
            club=None,
            playsLike_m=None,
            shotRef=None,
            ts=1,
        ),
    )
    publish(
        member_id,
        Tip(
            tipId="t2",
            title="Second",
            body="2",
            club=None,
            playsLike_m=None,
            shotRef=None,
            ts=2,
        ),
    )

    latest = get_latest_tip_for_member(member_id)
    assert latest is not None
    assert latest.tipId == "t2"


def test_publish_and_get_latest_tip_do_not_crash_under_concurrency() -> None:
    member_id = "mem-2"
    clear(member_id)

    def do_work(i: int) -> None:
        publish(
            member_id,
            Tip(
                tipId=f"t{i}",
                title="Tip",
                body="Body",
                club=None,
                playsLike_m=None,
                shotRef=None,
                ts=i,
            ),
        )
        _ = get_latest_tip_for_member(member_id)

    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(do_work, range(10)))

    latest = get_latest_tip_for_member(member_id)
    assert latest is not None
    assert latest.tipId == "t9"
