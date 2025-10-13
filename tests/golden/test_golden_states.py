from pathlib import Path

from arhud.simulation.golden import compare_hud_state


def test_primary_hud_state_matches_golden(tmp_path):
    result = compare_hud_state(
        state_name="primary",
        capture_dir=tmp_path,
        golden_dir="tests/golden/hud_states",
    )
    assert result.match_score == 1.0, "Primary HUD state must match golden baseline"
    capture_path = tmp_path / "primary.json"
    assert capture_path.exists()
    assert result.baseline is not None
    assert result.baseline["state"] == "primary"


def test_font_scale_variants_have_baselines():
    for scale in (1.0, 1.2, 1.3):
        path = Path(f"tests/golden/hud_states/primary_scale_{scale:.1f}.json")
        assert path.exists(), f"Expected baseline for font scale {scale}"
