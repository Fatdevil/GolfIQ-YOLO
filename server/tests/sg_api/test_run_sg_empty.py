from __future__ import annotations


def test_empty_run_returns_zero(client):
    response = client.get("/api/runs/empty/sg")
    assert response.status_code == 200

    body = response.json()
    assert body["total_sg"] == 0
    assert body["holes"] == []
