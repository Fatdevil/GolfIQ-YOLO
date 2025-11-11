from server.services import viewer_token


def test_verify_viewer_token_returns_false_on_bad_string():
    assert viewer_token.verify_viewer_token("evt1", "not-a-token") is False
