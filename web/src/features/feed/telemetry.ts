import { postTelemetryEvent } from "@web/api";

function emit(event: string, payload: Record<string, unknown>): void {
  void postTelemetryEvent({ event, ...payload, ts: Date.now(), source: "web" }).catch((error) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[feed/telemetry] failed to emit ${event}`, error);
    }
  });
}

export function emitFeedHomeRequested(payload: { limit: number }): void {
  emit("feed.home.requested", { limit: Math.max(0, Math.floor(payload.limit)) });
}

export function emitFeedHomeRendered(payload: { topCount: number; liveCount: number }): void {
  emit("feed.home.rendered", {
    topCount: Math.max(0, Math.floor(payload.topCount)),
    liveCount: Math.max(0, Math.floor(payload.liveCount)),
  });
}

export function emitFeedClickClip(payload: {
  clipId: string;
  eventId?: string | null;
  anchorSec?: number | null;
}): void {
  emit("feed.click.clip", {
    clipId: payload.clipId,
    eventId: payload.eventId ?? null,
    anchorSec: Number.isFinite(payload.anchorSec ?? NaN) ? Number(payload.anchorSec) : null,
  });
}

export function emitFeedClickWatch(payload: {
  eventId: string;
  livePath?: string | null;
}): void {
  emit("feed.click.watch", {
    eventId: payload.eventId,
    livePath: payload.livePath ?? null,
  });
}
