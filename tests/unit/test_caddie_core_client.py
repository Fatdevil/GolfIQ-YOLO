from arhud.caddie_core_client import CaddieCoreClient


def test_suggest_caches_results():
    client = CaddieCoreClient()
    first = client.suggest("fairway", 150.0)
    second = client.suggest("fairway", 150.0)
    assert first is second
