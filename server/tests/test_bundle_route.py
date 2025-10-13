import json
from fastapi.testclient import TestClient

from server.routes import bundle
from server_app import app


def _create_course_fixture(
    monkeypatch, tmp_path, course_id: str, features: list[dict]
) -> None:
    monkeypatch.setattr(bundle, "COURSES_DIR", tmp_path)
    (tmp_path / f"{course_id}.json").write_text(json.dumps({"features": features}))


def test_bundle_route_returns_payload(monkeypatch, tmp_path) -> None:
    _create_course_fixture(monkeypatch, tmp_path, "demo", features=[{"id": "f1"}])
    client = TestClient(app)
    response = client.get("/bundle/course/demo")
    assert response.status_code == 200
    payload = response.json()
    assert payload["courseId"] == "demo"
    assert isinstance(payload["ttlSec"], int)
    assert payload["features"] == [{"id": "f1"}]


def test_bundle_route_honors_env_ttl(monkeypatch, tmp_path) -> None:
    _create_course_fixture(monkeypatch, tmp_path, "demo", features=[])
    monkeypatch.setenv("BUNDLE_TTL_SECONDS", "1234")
    client = TestClient(app)
    response = client.get("/bundle/course/demo")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ttlSec"] == 1234
    assert response.headers["Cache-Control"] == "public, max-age=1234"


def test_bundle_route_etag_stable(monkeypatch, tmp_path) -> None:
    _create_course_fixture(monkeypatch, tmp_path, "demo", features=[{"id": "f1"}])
    client = TestClient(app)
    first = client.get("/bundle/course/demo")
    second = client.get("/bundle/course/demo")
    assert first.headers["ETag"] == second.headers["ETag"]
