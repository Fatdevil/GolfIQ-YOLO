from __future__ import annotations


def test_patch_updates_version_and_fields(client, auth_headers):
    run_id = "run-patch"
    base_payload = [
        {
            "hole": 3,
            "shot": 1,
            "clipId": "clip-a",
            "tStartMs": 10,
            "tEndMs": 20,
        }
    ]
    created = client.post(
        f"/api/runs/{run_id}/anchors", headers=auth_headers, json=base_payload
    )
    assert created.status_code == 200
    anchor = created.json()[0]
    assert anchor["version"] == 1

    patch_body = {
        "hole": 3,
        "shot": 1,
        "clipId": "clip-b",
        "tStartMs": 15,
        "tEndMs": 45,
    }
    patched = client.patch(
        f"/api/runs/{run_id}/anchors/3/1?version=1",
        headers=auth_headers,
        json=patch_body,
    )
    assert patched.status_code == 200
    patched_anchor = patched.json()
    assert patched_anchor["version"] == 2
    assert patched_anchor["clipId"] == "clip-b"
    assert patched_anchor["tEndMs"] == 45

    listed = client.get(f"/api/runs/{run_id}/anchors/3/1", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json()["clipId"] == "clip-b"
    assert listed.json()["version"] == 2

    conflict = client.patch(
        f"/api/runs/{run_id}/anchors/3/1?version=1",
        headers=auth_headers,
        json=patch_body,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "version mismatch"
