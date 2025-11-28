from fastapi.testclient import TestClient

from server.app import app
from server.services.demo_profile import DEMO_MEMBER_ID, build_demo_profile


def test_build_demo_profile_returns_demo_member() -> None:
    demo = build_demo_profile()

    assert demo.profile.member_id == DEMO_MEMBER_ID
    assert demo.analytics.member_id == DEMO_MEMBER_ID
    assert len(demo.analytics.sg_trend) >= 3
    assert demo.diagnosis is not None
    assert demo.diagnosis.findings
    assert demo.profile.model.weaknesses
    assert demo.profile.plan.steps


def test_demo_profile_endpoint_returns_payload() -> None:
    client = TestClient(app)

    response = client.get("/api/demo/profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["memberId"] == DEMO_MEMBER_ID
    assert payload["analytics"]["memberId"] == DEMO_MEMBER_ID
    assert payload["analytics"]["sgTrend"]
    assert payload["diagnosis"]["findings"]
