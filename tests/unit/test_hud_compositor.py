from arhud.hud_compositor import HudCompositor


def test_hud_compositor_generates_overlays():
    compositor = HudCompositor()
    state = compositor.compose(
        {
            "reticle": {"x": 0.5, "y": 0.4},
            "targets": [{"id": "pin", "distance": 150}],
            "wind_tier": "breeze",
            "offline": True,
            "fallback": False,
            "fov_ratio": 0.05,
        }
    )
    kinds = {overlay.kind for overlay in state.overlays}
    assert (
        "reticle" in kinds
        and "target" in kinds
        and "wind_hint" in kinds
        and "offline_badge" in kinds
    )
    assert not state.warnings
