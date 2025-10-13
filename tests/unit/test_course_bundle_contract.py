import json
from fastapi.testclient import TestClient

from server.config.bundle_config import DEFAULT_BUNDLE_TTL_SECONDS
from server.routes import bundle
from server_app import app


def test_bundle_contract(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(bundle, "COURSES_DIR", tmp_path)
    (tmp_path / "oakmont.json").write_text(
        json.dumps({"features": [{"id": "pin", "type": "Point"}]})
    )

    client = TestClient(app)
    response = client.get("/bundle/course/oakmont")
    assert response.status_code == 200
    payload = response.json()
    assert payload["courseId"] == "oakmont"
    assert payload["version"] == 1
    assert payload["ttlSec"] == DEFAULT_BUNDLE_TTL_SECONDS
    assert payload["features"] == [{"id": "pin", "type": "Point"}]
    assert response.headers["ETag"].startswith('W/"')
    assert response.headers["Cache-Control"] == (
        f"public, max-age={DEFAULT_BUNDLE_TTL_SECONDS}"
    )


def test_bundle_ttl_env_override(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(bundle, "COURSES_DIR", tmp_path)
    (tmp_path / "oakmont.json").write_text(json.dumps({"features": []}))
    monkeypatch.setenv("BUNDLE_TTL_SECONDS", "900")

    client = TestClient(app)
    response = client.get("/bundle/course/oakmont")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ttlSec"] == 900
    assert response.headers["Cache-Control"] == "public, max-age=900"
