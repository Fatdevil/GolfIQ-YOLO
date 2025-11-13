from server.sg.cache import RunSGCache
from server.sg.schemas import RunSG


def _make_run(run_id: str) -> RunSG:
    return RunSG(run_id=run_id, sg_total=0.0, holes=[], shots=[])


def test_lru_eviction_and_stats() -> None:
    cache = RunSGCache(maxsize=2, ttl_seconds=60)

    cache.put("r1", _make_run("r1"), fingerprint="a")
    cache.put("r2", _make_run("r2"), fingerprint="b")

    assert cache.get("r1", fingerprint="a") is not None
    if cache.get("r3") is None:
        cache.record_miss()

    cache.put("r3", _make_run("r3"), fingerprint="c")

    assert cache.get("r2", fingerprint="b") is None
    assert cache.get("r1", fingerprint="a") is not None
    assert cache.get("r3", fingerprint="c") is not None

    hits, misses = cache.stats()
    assert hits >= 2
    assert misses >= 1

    cache.clear()
    assert cache.get("r1") is None
