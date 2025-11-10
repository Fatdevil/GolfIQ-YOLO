from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_remote_config_get_200_then_304(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "sekret")
    response_first = client.get("/config/remote")
    assert response_first.status_code == 200
    etag = response_first.json()["etag"]

    response_second = client.get("/config/remote", headers={"If-None-Match": etag})
    assert response_second.status_code == 304
