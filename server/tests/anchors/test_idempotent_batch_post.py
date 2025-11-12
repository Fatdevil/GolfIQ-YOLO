from __future__ import annotations


def test_batch_post_is_idempotent(client, auth_headers):
    run_id = "run-idem"
    payload = [
        {
            "hole": 1,
            "shot": 1,
            "clipId": "clip-1",
            "tStartMs": 0,
            "tEndMs": 100,
        },
        {
            "hole": 1,
            "shot": 2,
            "clipId": "clip-2",
            "tStartMs": 110,
            "tEndMs": 200,
        },
    ]

    first = client.post(
        f"/api/runs/{run_id}/anchors", headers=auth_headers, json=payload
    )
    assert first.status_code == 200
    first_body = first.json()
    versions = {item["version"] for item in first_body}
    assert versions == {1}

    second = client.post(
        f"/api/runs/{run_id}/anchors", headers=auth_headers, json=payload
    )
    assert second.status_code == 200
    assert second.json() == first_body

    listed = client.get(f"/api/runs/{run_id}/anchors", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json() == first_body
