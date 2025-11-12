from __future__ import annotations


def test_create_and_list_sorted(client, auth_headers):
    run_id = "run-create"
    payload = [
        {
            "hole": 2,
            "shot": 1,
            "clipId": "clip-201",
            "tStartMs": 500,
            "tEndMs": 900,
        },
        {
            "hole": 1,
            "shot": 2,
            "clipId": "clip-102",
            "tStartMs": 100,
            "tEndMs": 200,
        },
    ]

    response = client.post(
        f"/api/runs/{run_id}/anchors", headers=auth_headers, json=payload
    )
    assert response.status_code == 200
    created = response.json()
    assert len(created) == 2
    assert {item["clipId"] for item in created} == {"clip-201", "clip-102"}

    listed = client.get(f"/api/runs/{run_id}/anchors", headers=auth_headers)
    assert listed.status_code == 200
    items = listed.json()
    assert [(item["hole"], item["shot"]) for item in items] == [(1, 2), (2, 1)]
