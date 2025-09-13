import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient  # noqa: E402

from server_app import app  # noqa: E402


def test_health_ok():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_protected_requires_api_key_when_set(monkeypatch):
    monkeypatch.setenv("API_KEY", "secret")
    client = TestClient(app)
    assert client.get("/protected").status_code in (401, 403)
    assert client.get("/protected", headers={"x-api-key": "secret"}).status_code == 200


def test_cors_allows_localhost(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost")
    client = TestClient(app)
    r = client.get("/health", headers={"Origin": "http://localhost"})
    assert r.headers.get("access-control-allow-origin") in ("http://localhost", "*")
