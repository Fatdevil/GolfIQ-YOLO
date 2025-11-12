from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor


def test_concurrent_posts_are_idempotent(client, auth_headers):
    run_id = "run-thread"
    url = f"/api/runs/{run_id}/anchors"

    def _call() -> tuple[int, list[dict[str, object]]]:
        response = client.post(
            url,
            headers=auth_headers,
            json=[
                {
                    "hole": 1,
                    "shot": 1,
                    "clipId": "clip-thread",
                    "tStartMs": 0,
                    "tEndMs": 50,
                }
            ],
        )
        return response.status_code, response.json()

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: _call(), range(8)))

    for status_code, payload in results:
        assert status_code == 200
        assert len(payload) == 1
        assert payload[0]["clipId"] == "clip-thread"
        assert payload[0]["version"] == 1

    final = client.get(f"/api/runs/{run_id}/anchors", headers=auth_headers)
    assert final.status_code == 200
    anchors = final.json()
    assert len(anchors) == 1
    assert anchors[0]["version"] == 1
