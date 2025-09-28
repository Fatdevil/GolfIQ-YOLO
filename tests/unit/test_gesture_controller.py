from arhud.gesture_controller import GestureController


def test_gesture_controller_updates_state():
    controller = GestureController()
    controller.handle("tap", {"x": 0.5, "y": 0.6})
    assert controller.reticle_position == (0.5, 0.6)
    controller.handle("swipe_left")
    assert controller.target_line_enabled is False
    controller.handle("long_press")
    assert controller.ground_plane_needs_reset is True