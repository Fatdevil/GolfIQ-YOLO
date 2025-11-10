from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_wind_returns_expected_fields():
    response = client.get("/providers/wind", params={"lat": 59.3, "lon": 18.1})
    assert response.status_code == 200
    data = response.json()
    assert {"speed_mps", "dir_from_deg"}.issubset(data.keys())


def test_elevation_returns_expected_fields():
    response = client.get("/providers/elevation", params={"lat": 59.3, "lon": 18.1})
    assert response.status_code == 200
    data = response.json()
    assert "elevation_m" in data
