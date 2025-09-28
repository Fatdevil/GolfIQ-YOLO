from arhud.pose_adapter import PoseAdapter


def test_pose_adapter_records_last_frame():
    adapter = PoseAdapter()
    frame = adapter.ingest((0.0, 1.0, 2.0), (0.0, 0.5, 1.0), 0.9, 1.0)
    assert adapter.last_frame == frame
    assert frame.tracking_quality == 0.9
