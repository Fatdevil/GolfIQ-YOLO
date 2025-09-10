from server.tracking.runtime import get_tracker


def test_sortlite_assigns_ids_stably() -> None:
    tr = get_tracker("sort")
    frame1 = [{"cls": "person", "bbox": [10, 10, 50, 80]}]
    frame2 = [{"cls": "person", "bbox": [12, 12, 52, 82]}]
    out1 = tr.update(frame1)
    out2 = tr.update(frame2)
    assert out1 and out2
    assert out1[0]["track_id"] == out2[0]["track_id"]


def test_bytetrack_stub_assigns_ids() -> None:
    tr = get_tracker("bytetrack")
    frame = [{"cls": "ball", "bbox": [5, 5, 10, 10]}]
    out = tr.update(frame)
    assert out and "track_id" in out[0]
