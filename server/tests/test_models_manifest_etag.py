import json

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_models_manifest_200_then_304(monkeypatch, tmp_path):
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        json.dumps({"models": [{"name": "demo"}]}), encoding="utf-8"
    )
    monkeypatch.setenv("MODEL_MANIFEST_PATH", str(manifest_path))

    first_response = client.get("/models/manifest.json")
    assert first_response.status_code == 200
    etag = first_response.headers.get("ETag")
    assert etag

    second_response = client.get(
        "/models/manifest.json", headers={"If-None-Match": etag}
    )
    assert second_response.status_code == 304
