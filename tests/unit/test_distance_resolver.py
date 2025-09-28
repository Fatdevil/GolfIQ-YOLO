from arhud.distance_resolver import resolve_distance


def test_distance_resolver_clamps_accuracy():
    result = resolve_distance((33.6400, -117.8440), (33.6405, -117.8443), 5.0, 0.7)
    assert isinstance(result.meters, (int, float))
    assert result.meters > 0