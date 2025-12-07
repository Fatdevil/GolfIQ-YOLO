
def test_bag_stats_endpoint(round_client):
    client, _, rounds = round_client
    player_id = "test-user"
    rnd = rounds.start_round(player_id=player_id, course_id=None, tee_name=None, holes=9, start_hole=1)

    def _append(distance_m: float):
        delta = distance_m / 111_111
        rounds.append_shot(
            player_id=player_id,
            round_id=rnd.id,
            hole_number=1,
            club="7i",
            start_lat=0.0,
            start_lon=0.0,
            end_lat=delta,
            end_lon=0.0,
            wind_speed_mps=0.0,
            wind_direction_deg=None,
            elevation_delta_m=0.0,
            note=None,
            tempo_backswing_ms=None,
            tempo_downswing_ms=None,
            tempo_ratio=None,
        )

    _append(150)
    _append(152)
    _append(148)
    _append(400)  # should be trimmed out

    response = client.get("/api/player/bag-stats", headers={"x-api-key": player_id})
    assert response.status_code == 200

    payload = response.json()
    assert "7i" in payload
    seven = payload["7i"]
    assert seven["sampleCount"] == 2
    assert abs(seven["meanDistanceM"] - 151) < 5
