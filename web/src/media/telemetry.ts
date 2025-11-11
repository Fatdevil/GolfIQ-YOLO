import { useEffect, useRef, type RefObject } from "react";

import { postTelemetryEvent } from "../api";

interface MediaTelemetryPayload {
  clipId?: string | null;
  runId?: string | null;
  path?: string | null;
  signed?: boolean;
  source?: string;
  exp?: number | null;
  playStartMs?: number;
  stage?: string;
  code?: number | null;
  message?: string | null;
}

type PlaybackContext = {
  clipId: string | null;
  runId: string | null;
  path: string | null;
  signed: boolean;
  source: string;
  exp: number | null;
  requestedAt: number | null;
};

function sanitize(payload: MediaTelemetryPayload): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  cleaned.ts = Date.now();
  return cleaned;
}

function emitMedia(event: string, payload: MediaTelemetryPayload): void {
  const body = sanitize(payload);
  void postTelemetryEvent({ event, ...body }).catch((error) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[media/telemetry] failed to emit ${event}`, error);
    }
  });
}

export function emitMediaPlayRequested(payload: MediaTelemetryPayload): void {
  emitMedia("media.play.requested", payload);
}

export function emitMediaPlaySigned(payload: MediaTelemetryPayload): void {
  emitMedia("media.play.signed", payload);
}

export function emitMediaPlayFailed(payload: MediaTelemetryPayload): void {
  emitMedia("media.play.failed", payload);
}

export function useMediaPlaybackTelemetry(
  videoRef: RefObject<HTMLVideoElement | null>,
  context: {
    clipId?: string | null;
    runId?: string | null;
    path: string | null;
    signed: boolean;
    source: string;
    exp?: number | null;
  },
): void {
  const playbackRef = useRef<PlaybackContext>({
    clipId: context.clipId ?? null,
    runId: context.runId ?? null,
    path: context.path ?? null,
    signed: context.signed,
    source: context.source,
    exp: context.exp ?? null,
    requestedAt: null,
  });

  useEffect(() => {
    playbackRef.current.clipId = context.clipId ?? null;
    playbackRef.current.runId = context.runId ?? null;
    playbackRef.current.path = context.path ?? null;
    playbackRef.current.signed = context.signed;
    playbackRef.current.source = context.source;
    playbackRef.current.exp = context.exp ?? null;
  }, [context.clipId, context.runId, context.path, context.signed, context.source, context.exp]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return () => undefined;
    }

    const handlePlay = () => {
      playbackRef.current.requestedAt = performance.now();
      emitMediaPlayRequested(playbackRef.current);
    };

    const handleSuccess = (stage: string) => {
      const startedAt = playbackRef.current.requestedAt;
      if (startedAt == null) {
        return;
      }
      const duration = Math.round(performance.now() - startedAt);
      playbackRef.current.requestedAt = null;
      emitMediaPlaySigned({
        ...playbackRef.current,
        playStartMs: duration,
        stage,
      });
    };

    const handleCanPlay = () => handleSuccess("canplay");
    const handlePlaying = () => handleSuccess("playing");

    const handleError = () => {
      const mediaError = video.error;
      const code = mediaError?.code ?? null;
      const message = mediaError?.message ?? null;
      const startedAt = playbackRef.current.requestedAt;
      playbackRef.current.requestedAt = null;
      emitMediaPlayFailed({
        ...playbackRef.current,
        code,
        message,
        playStartMs: startedAt ? Math.round(performance.now() - startedAt) : undefined,
      });
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
    };
  }, [videoRef, context.clipId, context.runId, context.path, context.signed, context.source, context.exp]);
}
