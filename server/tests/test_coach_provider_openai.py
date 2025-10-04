from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from server.services.coach.providers import (
    CoachProviderError,
    CoachProviderTimeout,
    OpenAICoachProvider,
)


def build_provider(response: httpx.Response) -> OpenAICoachProvider:
    def handler(request: httpx.Request) -> httpx.Response:
        return response

    transport = httpx.MockTransport(handler)
    client = httpx.Client(base_url="https://api.openai.com/v1", transport=transport)
    return OpenAICoachProvider(api_key="test", http_client=client, timeout=1.0)


def test_generate_uses_tool_call_feedback() -> None:
    feedback_text = "Great tempo."
    payload = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": "analyze_swing",
                                "arguments": json.dumps({"feedback": feedback_text}),
                            }
                        }
                    ]
                }
            }
        ]
    }

    provider = build_provider(httpx.Response(200, json=payload))

    assert provider.generate({"ballSpeedMps": 60}) == feedback_text


def test_generate_falls_back_to_message_content() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "Fallback content",
                }
            }
        ]
    }
    provider = build_provider(httpx.Response(200, json=payload))

    assert provider.generate({}) == "Fallback content"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"choices": []},
        {"choices": [{"message": {"tool_calls": [{}]}}]},
        {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "function": {
                                    "name": "analyze_swing",
                                    "arguments": "not json",
                                }
                            }
                        ]
                    }
                }
            ]
        },
    ],
)
def test_generate_raises_for_invalid_payload(payload: dict[str, Any]) -> None:
    provider = build_provider(httpx.Response(200, json=payload))
    with pytest.raises(CoachProviderError):
        provider.generate({})


def test_post_translates_timeout_to_provider_timeout() -> None:
    class TimeoutClient:
        def post(self, *_args: Any, **_kwargs: Any) -> httpx.Response:
            raise httpx.TimeoutException("timeout")

    provider = OpenAICoachProvider(
        api_key="test", http_client=TimeoutClient(), timeout=0.1
    )

    with pytest.raises(CoachProviderTimeout):
        provider.generate({})


def test_generate_requires_api_key() -> None:
    with httpx.Client(base_url="https://api.openai.com/v1") as client:
        provider = OpenAICoachProvider(api_key="", http_client=client)
        with pytest.raises(CoachProviderError):
            provider.generate({})


def test_generate_uses_global_httpx_post(monkeypatch) -> None:
    called: dict[str, Any] = {}

    def fake_post(
        url: str, json: Any, headers: dict[str, str], timeout: float
    ) -> httpx.Response:
        called["url"] = url
        called["headers"] = headers
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "Hi"}}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAICoachProvider(api_key="test", http_client=None, timeout=0.1)

    assert provider.generate({}) == "Hi"
    assert called["url"] == "https://api.openai.com/v1/chat/completions"
    assert called["headers"]["Authorization"] == "Bearer test"


def test_post_translates_http_error() -> None:
    class ErrorClient:
        def post(self, *_args: Any, **_kwargs: Any) -> httpx.Response:
            raise httpx.HTTPError("failure")

    provider = OpenAICoachProvider(
        api_key="test", http_client=ErrorClient(), timeout=0.1
    )

    with pytest.raises(CoachProviderError):
        provider.generate({})


def test_generate_raises_on_http_status_error() -> None:
    response = httpx.Response(
        401,
        json={"error": "bad key"},
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
    )
    provider = build_provider(response)

    with pytest.raises(CoachProviderError):
        provider.generate({})


def test_generate_raises_when_no_feedback_present() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": "analyze_swing",
                                "arguments": json.dumps({"feedback": "   "}),
                            }
                        }
                    ],
                    "content": "   ",
                }
            }
        ]
    }
    provider = build_provider(httpx.Response(200, json=payload))

    with pytest.raises(CoachProviderError):
        provider.generate({})
