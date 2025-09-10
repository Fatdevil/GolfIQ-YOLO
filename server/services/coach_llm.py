import json
import os

import httpx

SYSTEM = "Du är en golfcoach. Ge tydlig, kort feedback baserad på mätdata."


def _offline_text(mode: str, notes: str):
    if mode == "detailed":
        return (
            "Din launch och hastighet ser lovande ut. Håll händerna lite högre i "
            "impact för att minska loft."
        )
    if mode == "drill":
        return (
            "Öva 10 slag med jämn rytm (3:1). Fokusera på stabilt huvud och jämn träff."
        )
    base = "Solid sving! Fortsätt träna konsekvent bollträff."
    return base + (f" Notering: {notes}" if notes else "")


def generate(mode: str = "short", metrics: dict | None = None, notes: str = "") -> str:
    # Feature flag: kör offline-text om inte aktiverad
    if os.getenv("COACH_FEATURE", "false").lower() != "true":
        return _offline_text(mode, notes)

    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    if not api_key:
        return _offline_text(mode, notes)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": json.dumps(
                    {"mode": mode, "metrics": metrics or {}, "notes": notes},
                    ensure_ascii=False,
                ),
            },
        ],
        "max_tokens": 200,
        "temperature": 0.2,
    }
    try:
        r = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        # Faller tillbaka till offline om något går fel
        return _offline_text(mode, notes)
