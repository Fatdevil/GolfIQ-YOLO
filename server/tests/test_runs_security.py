from fastapi.testclient import TestClient

from server.app import app


def test_runs_get_rejects_path_traversal():
    with TestClient(app) as client:
        response = client.get("/runs/../../etc/passwd")
    assert response.status_code == 404


def test_runs_delete_rejects_path_traversal():
    with TestClient(app) as client:
        response = client.delete("/runs/../../evil")
    assert response.status_code == 404
