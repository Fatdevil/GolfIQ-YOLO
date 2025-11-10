# Tournament-safe commentary gating

The clip commentary API enforces tournament-safe state centrally on the server.
Host state is treated as the single source of truth for safety flags and any
request made while `safe` is true is rejected with HTTP 423 (`TOURNAMENT_SAFE`).
Clients should treat this response as a hard block — do not retry until the host
exits tournament-safe mode. The web admin UI disables the request button and
surfaces a clear banner when commentary is unavailable.

Telemetry events (`clip.commentary.blocked_safe`) are emitted whenever the guard
blocks a request so that operations can monitor access attempts during events.
