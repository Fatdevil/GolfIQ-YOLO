# Coach v1

Coach v1 delivers PGA-style swing insights powered by an interchangeable provider layer. The default implementation calls OpenAI with a function-calling schema that mirrors GolfIQ swing metrics and returns concise markdown-ready feedback.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `COACH_PROVIDER` | `openai` | Selects the provider implementation (`openai` or `mock`). |
| `OPENAI_API_KEY` | _required_ | API key for OpenAI when using the OpenAI provider. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Chat completion model used for feedback generation. |
| `OPENAI_TIMEOUT` | `3` | Timeout in seconds for the OpenAI API call. |

## Swing metrics schema

The OpenAI provider enforces a structured function signature to keep the model grounded in telemetry:

```json
{
  "name": "analyze_swing",
  "parameters": {
    "type": "object",
    "properties": {
      "metrics": {
        "type": "object",
        "properties": {
          "ballSpeedMps": { "type": ["number", "null"] },
          "clubSpeedMps": { "type": ["number", "null"] },
          "sideAngleDeg": { "type": ["number", "null"] },
          "vertLaunchDeg": { "type": ["number", "null"] },
          "carryEstM": { "type": ["number", "null"] },
          "quality": { "type": ["object", "string", "null"] }
        },
        "additionalProperties": true
      },
      "feedback": {
        "type": "string",
        "description": "Player-facing notes that follow the system prompt"
      }
    },
    "required": ["feedback"]
  }
}
```

## Prompt template

System prompt: _"You are an experienced PGA coach. Be brief, specific, and friendly. Write 4-6 sentences, highlight one strength, one primary focus area, and share two actionable drills."_

User prompt: the serialized swing metrics dictionary for the selected run.

## Error handling

* Calls are time-limited by `OPENAI_TIMEOUT` seconds.
* Timeouts or provider errors return a friendly fallback string: _"Coach feedback is taking longer than expected. Please try again in a moment."_
* `/coach/feedback` is rate limited in-memory (5 requests per IP per minute) and responds with HTTP 429 on bursts.
