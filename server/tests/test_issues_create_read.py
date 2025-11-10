from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_issue_create_and_read(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "k")

    create_response = client.post(
        "/issues", json={"msg": "hello"}, headers={"x-api-key": "k"}
    )
    assert create_response.status_code in (200, 201)
    issue_id = create_response.json()["id"]

    read_response = client.get(f"/issues/{issue_id}", headers={"x-api-key": "k"})
    assert read_response.status_code == 200
    assert read_response.json()["payload"]["msg"] == "hello"
