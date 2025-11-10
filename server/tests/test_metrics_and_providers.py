from fastapi.testclient import TestClient

from server.app import app
from server.providers.wind import WindProviderResult


client = TestClient(app)


def test_metrics_ok_text_plain():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert b"requests_total" in response.content


def test_wind_endpoint_minimal(monkeypatch):
    fake_result = WindProviderResult(
        speed_mps=4.2,
        direction_from_deg=180.0,
        etag="demo",
        expires_at=1_726_011_200.0,
    )
    monkeypatch.setattr(
        "server.providers.wind.get_wind",
        lambda lat, lon: fake_result,
    )

    response = client.get("/providers/wind", params={"lat": 59.3, "lon": 18.1})
    assert response.status_code == 200
    payload = response.json()
    assert "speed_mps" in payload
    assert "dir_from_deg" in payload
