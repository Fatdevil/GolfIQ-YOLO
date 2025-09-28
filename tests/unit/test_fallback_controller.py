from arhud.fallback_controller import FallbackController


def test_fallback_triggers_after_timeout():
    controller = FallbackController(timeout=0.5)
    controller.step(tracking_quality=0.4, dt=0.3)
    assert controller.state.compass_mode is False
    controller.step(tracking_quality=0.3, dt=0.3)
    assert controller.state.compass_mode is True