from __future__ import annotations


def test_requires_api_key(client, auth_headers):
    run_id = "run-guard"
    url = f"/api/runs/{run_id}/anchors"

    unauthorized = client.get(url)
    assert unauthorized.status_code == 401

    authorized = client.get(url, headers=auth_headers)
    assert authorized.status_code == 200
    assert authorized.json() == []

    payload = [
        {
            "hole": 1,
            "shot": 1,
            "clipId": "clip-1",
            "tStartMs": 0,
            "tEndMs": 100,
        }
    ]
    unauthorized_post = client.post(url, json=payload)
    assert unauthorized_post.status_code == 401

    created = client.post(url, headers=auth_headers, json=payload)
    assert created.status_code == 200
