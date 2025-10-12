import pytest

from arhud.simulation.golden import compare_hud_state


@pytest.fixture()
def golden_dir() -> str:
    return "tests/golden/hud_states"


def test_primary_hud_state_matches_golden(tmp_path, golden_dir):
    result = compare_hud_state(
        state_name="primary",
        capture_dir=tmp_path,
        golden_dir=golden_dir,
    )
    assert result.match_score == pytest.approx(1.0)
    assert result.metadata.get("state") == "primary"
    assert result.metadata.get("widgets") == [
        "ballSpeed",
        "carryEst",
        "sideAngle",
    ]


def test_font_scale_variants_have_baselines(tmp_path, golden_dir):
    result = compare_hud_state(
        state_name="primary",
        capture_dir=tmp_path,
        golden_dir=golden_dir,
    )
    assert result.metadata.get("scales") == [1.0, 1.2, 1.3]
