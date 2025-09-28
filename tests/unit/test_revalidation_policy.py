from arhud.revalidation import should_revalidate


def test_triggers_on_position_threshold():
    assert (
        should_revalidate(
            delta_position=0.21,
            delta_rotation=0.1,
            tracking_quality=0.9,
            elapsed_since_last=0.1,
            validations_this_second=0,
        )
        is True
    )


def test_triggers_on_rotation_threshold():
    assert (
        should_revalidate(
            delta_position=0.05,
            delta_rotation=0.81,
            tracking_quality=0.9,
            elapsed_since_last=0.1,
            validations_this_second=0,
        )
        is True
    )


def test_triggers_on_tracking_drop():
    assert (
        should_revalidate(
            delta_position=0.05,
            delta_rotation=0.2,
            tracking_quality=0.4,
            elapsed_since_last=0.1,
            validations_this_second=0,
        )
        is True
    )


def test_triggers_on_heartbeat():
    assert (
        should_revalidate(
            delta_position=0.03,
            delta_rotation=0.1,
            tracking_quality=0.8,
            elapsed_since_last=0.6,
            validations_this_second=0,
        )
        is True
    )


def test_debounces_and_caps():
    assert (
        should_revalidate(
            delta_position=0.03,
            delta_rotation=0.1,
            tracking_quality=0.8,
            elapsed_since_last=0.05,
            validations_this_second=9,
        )
        is False
    )
