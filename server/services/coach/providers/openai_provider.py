from __future__ import annotations

import json
import os
from typing import Any, Mapping

import httpx

from .base import CoachProvider, CoachProviderError, CoachProviderTimeout

_SYSTEM_PROMPT = (
    "You are an experienced PGA coach. Be brief, specific, and friendly. "
    "Write 4-6 sentences, highlight one strength, one primary focus area, and share two actionable drills."
)

_FUNCTION_DEFINITION = {
    "name": "analyze_swing",
    "description": "Craft actionable golf swing feedback based on the supplied launch monitor metrics.",
    "parameters": {
        "type": "object",
        "properties": {
            "metrics": {
                "type": "object",
                "properties": {
                    "ballSpeedMps": {
                        "type": ["number", "null"],
                        "description": "Ball speed in meters per second.",
                    },
                    "clubSpeedMps": {
                        "type": ["number", "null"],
                        "description": "Club head speed in meters per second.",
                    },
                    "sideAngleDeg": {
                        "type": ["number", "null"],
                        "description": "Side angle at launch in degrees.",
                    },
                    "vertLaunchDeg": {
                        "type": ["number", "null"],
                        "description": "Vertical launch angle in degrees.",
                    },
                    "carryEstM": {
                        "type": ["number", "null"],
                        "description": "Estimated carry distance in meters.",
                    },
                    "quality": {
                        "type": ["object", "string", "null"],
                        "description": "Quality markers or tags returned by the analyzer.",
                        "additionalProperties": True,
                    },
                },
                "additionalProperties": True,
            },
            "feedback": {
                "type": "string",
                "description": "Player-facing feedback following the system instructions.",
            },
        },
        "required": ["feedback"],
    },
}


class OpenAICoachProvider(CoachProvider):
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._model = model or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        timeout_env = os.getenv("OPENAI_TIMEOUT")
        self._timeout = timeout if timeout is not None else float(timeout_env or 3.0)
        self._client = http_client

    def _post(self, payload: Mapping[str, Any]) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if not self._api_key:
            raise CoachProviderError("OPENAI_API_KEY is not configured")
        client = self._client
        try:
            if client is not None:
                return client.post(
                    "/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=self._timeout,
                )
            return httpx.post(
                "https://api.openai.com/v1/chat/completions",
                json=payload,
                headers=headers,
                timeout=self._timeout,
            )
        except httpx.TimeoutException as exc:
            raise CoachProviderTimeout("OpenAI request timed out") from exc
        except httpx.HTTPError as exc:
            raise CoachProviderError("OpenAI request failed") from exc

    def generate(self, metrics: Mapping[str, Any]) -> str:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "Analyze the swing metrics below and produce feedback. "
                        "Return friendly, specific coaching notes.\n\n"
                        + json.dumps(dict(metrics), ensure_ascii=False)
                    ),
                },
            ],
            "tools": [{"type": "function", "function": _FUNCTION_DEFINITION}],
            "tool_choice": {"type": "function", "function": {"name": "analyze_swing"}},
            "temperature": 0.2,
            "max_tokens": 400,
        }

        response = self._post(payload)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise CoachProviderError("OpenAI responded with an error") from exc

        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise CoachProviderError("OpenAI response missing choices")
        message = choices[0].get("message") or {}
        tool_calls = message.get("tool_calls") or []
        if tool_calls:
            try:
                arguments = tool_calls[0]["function"]["arguments"]
            except (KeyError, TypeError) as exc:
                raise CoachProviderError("Malformed function call from OpenAI") from exc
            try:
                parsed = json.loads(arguments)
            except json.JSONDecodeError as exc:
                raise CoachProviderError(
                    "Invalid JSON in OpenAI function arguments"
                ) from exc
            feedback = parsed.get("feedback")
            if isinstance(feedback, str) and feedback.strip():
                return feedback.strip()
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
        raise CoachProviderError("OpenAI did not return feedback text")
