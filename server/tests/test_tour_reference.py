import json
from pathlib import Path

from server.services import tour_reference as tour_reference


def _configure_reference(monkeypatch, tmp_path: Path, references):
    path = tmp_path / "tour.json"
    path.write_text(json.dumps({"references": references}))
    monkeypatch.setattr(tour_reference, "_REFERENCE_PATH", path)
    tour_reference._reset_cache_for_tests()
    return path


def test_get_reference_bands_and_compare(monkeypatch, tmp_path):
    references = [
        {
            "metric": "max_shoulder_rotation",
            "club": "driver",
            "group": "tour_male",
            "range_min": 80,
            "range_max": 100,
        },
        {
            "metric": "max_shoulder_rotation",
            "club": "7i",
            "group": "tour_male",
            "range_min": 70,
            "range_max": 95,
        },
    ]
    _configure_reference(monkeypatch, tmp_path, references)

    driver_bands = tour_reference.get_reference_bands("max_shoulder_rotation", "driver")
    assert len(driver_bands) == 1
    assert driver_bands[0]["range_min"] == 80

    comparison = tour_reference.compare_to_bands(
        "max_shoulder_rotation", 75, club="driver"
    )
    assert comparison is not None
    assert comparison["status"] == "below"
    assert comparison["band_group"] == "tour_male"

    in_range = tour_reference.compare_to_bands(
        "max_shoulder_rotation", 90, club="7i"
    )
    assert in_range is not None
    assert in_range["status"] == "in_range"


def test_missing_reference_file(monkeypatch, tmp_path):
    missing_path = tmp_path / "missing.json"
    monkeypatch.setattr(tour_reference, "_REFERENCE_PATH", missing_path)
    tour_reference._reset_cache_for_tests()

    bands = tour_reference.get_reference_bands("max_x_factor", club="driver")
    assert bands == []
    assert tour_reference.compare_to_bands("max_x_factor", 30) is None
