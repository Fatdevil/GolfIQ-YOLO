from server.utils.qr_svg import qr_svg_placeholder


def test_qr_svg_placeholder_includes_label_and_size():
    svg = qr_svg_placeholder(size=120, label="No QR")
    assert 'width="120"' in svg
    assert 'height="120"' in svg
    assert "No QR" in svg
