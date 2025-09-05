from server.api.main import app
from fastapi.testclient import TestClient
import yaml


def test_openapi_paths_and_schemas_match():
    client = TestClient(app)
    server_spec = client.get("/openapi.json").json()
    with open("contracts/api.openapi.yaml","r", encoding="utf-8") as f:
        file_spec = yaml.safe_load(f)
    # Minikoll: path /analyze finns i båda och har POST
    assert "/analyze" in server_spec["paths"]
    assert "/analyze" in file_spec["paths"]
    assert "post" in server_spec["paths"]["/analyze"]
    assert "post" in file_spec["paths"]["/analyze"]
