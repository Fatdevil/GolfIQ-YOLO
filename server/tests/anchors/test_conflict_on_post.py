from __future__ import annotations


def test_conflict_on_batch_post(client, auth_headers):
    run_id = "run-conflict"
    base_payload = [
        {
            "hole": 1,
            "shot": 1,
            "clipId": "clip-1",
            "tStartMs": 0,
            "tEndMs": 100,
        }
    ]
    conflict_payload = [
        {
            "hole": 1,
            "shot": 1,
            "clipId": "clip-2",
            "tStartMs": 0,
            "tEndMs": 150,
        }
    ]

    first = client.post(
        f"/api/runs/{run_id}/anchors", headers=auth_headers, json=base_payload
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/runs/{run_id}/anchors", headers=auth_headers, json=conflict_payload
    )
    assert second.status_code == 409
    assert second.json()["detail"] == "conflict for existing anchor"

    listed = client.get(f"/api/runs/{run_id}/anchors", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()[0]["clipId"] == "clip-1"
