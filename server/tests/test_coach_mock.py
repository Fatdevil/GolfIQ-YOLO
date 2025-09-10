import os

from fastapi.testclient import TestClient

from server.api.main import app


def test_coach_mock_mode():
    os.environ["COACH_FEATURE"] = "false"
    client = TestClient(app)
    r = client.post("/coach", json={"mode": "short", "notes": "Test"})
    assert r.status_code == 200
    assert "sving" in r.json()["text"].lower()
