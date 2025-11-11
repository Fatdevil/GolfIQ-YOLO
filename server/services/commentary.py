"""AI commentary generation for event clips."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Mapping, Sequence

import httpx

from server.schemas.commentary import CommentaryStatus
from server.services import clips_repo
from server.services import commentary_queue, telemetry as telemetry_service

_logger = logging.getLogger("server.services.commentary")


@dataclass(slots=True)
class CommentaryResult:
    """Result returned after commentary generation."""

    clip_id: str
    title: str
    summary: str
    tts_url: str | None = None


def build_prompt(
    clip: Mapping[str, Any],
    event: Mapping[str, Any],
    board: Sequence[Mapping[str, Any]] | Iterable[Mapping[str, Any]],
) -> str:
    """Construct a prompt for the LLM based on clip and leaderboard context."""

    locale = str(event.get("locale") or clip.get("locale") or "en").lower()
    player_name = str(clip.get("player_name") or clip.get("playerName") or "Player")
    hole = clip.get("hole") or clip.get("hole_number") or clip.get("holeNumber")
    par = clip.get("par") or clip.get("hole_par") or clip.get("parValue")
    strokes = clip.get("strokes") or clip.get("stroke_count") or clip.get("score")
    to_par = clip.get("to_par") or clip.get("score_to_par") or clip.get("relativeScore")
    description = clip.get("description") or clip.get("result")

    board_rows: Sequence[Mapping[str, Any]]
    if isinstance(board, Sequence):
        board_rows = board
    else:
        board_rows = list(board)

    leaderboard_lines: list[str] = []
    for entry in board_rows[:5]:
        name = entry.get("name") or entry.get("player") or "Player"
        gross = entry.get("gross")
        net = entry.get("net")
        thru = entry.get("thru")
        hole_pos = entry.get("hole") or entry.get("position")
        parts = [f"{name}"]
        if gross is not None:
            parts.append(f"gross {gross}")
        if net is not None:
            parts.append(f"net {net}")
        if entry.get("to_par") is not None:
            parts.append(f"to par {entry.get('to_par')}")
        if thru is not None:
            parts.append(f"thru {thru}")
        if hole_pos is not None and thru is None:
            parts.append(f"hole {hole_pos}")
        leaderboard_lines.append(", ".join(str(p) for p in parts if p is not None))

    leaderboard_summary = (
        "\n".join(leaderboard_lines) or "No leaderboard context available."
    )

    prompt_lines = [
        "You are an impartial golf commentator describing a highlight clip.",
        "Respond only with factual spectator commentary and avoid giving advice.",
        "Output JSON with keys 'title' and 'summary' in the requested language.",
        f"Language: {locale}",
        f"Event: {event.get('name', 'Golf Event')}",
    ]

    if event_id := event.get("id"):
        prompt_lines.append(f"Event ID: {event_id}")
    prompt_lines.append(f"Player: {player_name}")
    if hole:
        prompt_lines.append(f"Hole: {hole}")
    if par is not None:
        prompt_lines.append(f"Par: {par}")
    if strokes is not None:
        prompt_lines.append(f"Strokes: {strokes}")
    if to_par is not None:
        prompt_lines.append(f"Relative score: {to_par}")
    if description:
        prompt_lines.append(f"Clip notes: {description}")

    prompt_lines.append("Leaderboard snapshot:")
    prompt_lines.append(leaderboard_summary)

    return "\n".join(str(line) for line in prompt_lines if line is not None)


def call_llm(prompt: str) -> Dict[str, str]:
    """Invoke the configured LLM provider to generate commentary."""

    if os.getenv("LLM_ENABLED", "false").lower() != "true":
        raise RuntimeError("LLM provider disabled")

    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    if provider != "openai":
        raise RuntimeError(f"unsupported LLM provider: {provider}")

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("missing OPENAI_API_KEY for LLM call")

    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    system_prompt = (
        'You are an AI golf commentator. Return compact JSON: {"title": str, "summary": str}.'
        " Keep the response factual and under the requested character limits."
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 400,
    }

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    message = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    try:
        parsed = json.loads(message)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive guard
        _logger.error("LLM response was not valid JSON: %s", message)
        raise ValueError("invalid LLM response") from exc

    title = parsed.get("title")
    summary = parsed.get("summary")
    if not isinstance(title, str) or not isinstance(summary, str):
        raise ValueError("LLM response missing required fields")

    return {"title": title.strip(), "summary": summary.strip()}


def synthesize_tts(text: str) -> str | None:
    """Generate TTS audio for the supplied text."""

    if os.getenv("TTS_ENABLED", "false").lower() != "true":
        return None
    provider = os.getenv("TTS_PROVIDER", "openai").lower()
    raise RuntimeError(f"TTS provider '{provider}' not configured")


def generate_commentary(clip_id: str) -> CommentaryResult:
    """Generate commentary for a clip and persist the result."""

    clip_id = str(clip_id)
    clip = clips_repo.get_clip(clip_id)
    event_id = _require_event_id(clip)
    sg_delta = _resolve_clip_sg_delta(clip)
    commentary_queue.upsert(
        clip_id,
        event_id=event_id,
        status=CommentaryStatus.running,
        sg_delta=sg_delta,
    )
    telemetry_service.emit_commentary_running(event_id, clip_id)

    try:
        event = _load_event(event_id)
        board = _load_board(event_id)
        prompt = build_prompt(clip, event, board)
        llm_result = call_llm(prompt)
        title = _truncate(llm_result.get("title", ""), 60)
        summary = _truncate(llm_result.get("summary", ""), 200)

        tts_url: str | None = None
        if os.getenv("TTS_ENABLED", "false").lower() == "true":
            tts_url = synthesize_tts(summary)

        clips_repo.update_ai_commentary(
            clip_id, title=title, summary=summary, tts_url=tts_url
        )
        commentary_queue.upsert(
            clip_id,
            event_id=event_id,
            status=CommentaryStatus.ready,
            title=title,
            summary=summary,
            tts_url=tts_url,
            sg_delta=sg_delta,
        )
        telemetry_service.emit_commentary_done(event_id, clip_id, has_tts=bool(tts_url))
        return CommentaryResult(
            clip_id=clip_id, title=title, summary=summary, tts_url=tts_url
        )
    except Exception as exc:  # pragma: no cover - error path exercised in tests
        commentary_queue.upsert(
            clip_id,
            event_id=event_id,
            status=CommentaryStatus.failed,
            title=None,
            summary=None,
            tts_url=None,
            sg_delta=sg_delta,
        )
        telemetry_service.emit_commentary_failed(event_id, clip_id, error=str(exc))
        raise


def _truncate(text: str, limit: int) -> str:
    value = (text or "").strip()
    if len(value) <= limit:
        return value
    return value[:limit].rstrip()


def _require_event_id(clip: Mapping[str, Any]) -> str:
    event_id = clip.get("event_id") or clip.get("eventId")
    if not event_id:
        raise ValueError("clip missing event id")
    return str(event_id)


def _load_event(event_id: str) -> Mapping[str, Any]:
    from server.routes import events as events_routes

    event = events_routes._REPOSITORY.get_event(event_id)
    if not event:
        raise LookupError(f"event {event_id} not found")
    return event


def _load_board(event_id: str) -> Iterable[Mapping[str, Any]]:
    from server.routes import events as events_routes

    return events_routes._REPOSITORY.get_board(event_id)


def _resolve_clip_sg_delta(clip: Mapping[str, Any]) -> float | None:
    value = clip.get("sg_delta") or clip.get("sgDelta")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


__all__ = [
    "CommentaryResult",
    "build_prompt",
    "call_llm",
    "synthesize_tts",
    "generate_commentary",
]
