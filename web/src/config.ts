export const visualTracerEnabled =
  (import.meta.env.VITE_VISUAL_TRACER_ENABLED ?? "true") !== "false";

export const playsLikeEnabled =
  (import.meta.env.VITE_PLAYS_LIKE_ENABLED ?? "false") === "true";

export const qaReplayEnabled =
  import.meta.env.DEV || (import.meta.env.VITE_QA_MODE ?? "false") === "true";

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const queuePollMs = parseNumber(import.meta.env.VITE_QUEUE_POLL_MS, 10_000);
export const uploadRetryMaxMs = parseNumber(
  import.meta.env.VITE_UPLOAD_RETRY_MAX_MS,
  120_000,
);
export const uploadPresignVersion = import.meta.env.VITE_UPLOAD_PRESIGN_VERSION ?? "v2";
