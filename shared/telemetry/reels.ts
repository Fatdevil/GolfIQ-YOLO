export type ReelTelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

let emitter: ReelTelemetryEmitter | null = null;

function safeEmit(event: string, payload: Record<string, unknown>): void {
  if (!emitter) {
    return;
  }
  try {
    emitter(event, payload);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[telemetry/reels] emit failed', error);
    }
  }
}

export function setReelTelemetryEmitter(candidate: ReelTelemetryEmitter | null | undefined): void {
  emitter = typeof candidate === 'function' ? candidate : null;
}

export function emitReelExportStart(payload: {
  template: string;
  durationMs: number;
  codec: 'mp4' | 'webm';
  fps: number;
  width: number;
  height: number;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.start', {
    template: payload.template,
    duration_ms: Number.isFinite(payload.durationMs) ? Math.round(payload.durationMs) : null,
    codec: payload.codec,
    fps: payload.fps,
    width: payload.width,
    height: payload.height,
    ts: Date.now(),
  });
}

export function emitReelExportProgress(payload: {
  template: string;
  progress: number;
  stage: string;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.progress', {
    template: payload.template,
    progress: Math.max(0, Math.min(1, Number(payload.progress) || 0)),
    stage: payload.stage,
    ts: Date.now(),
  });
}

export function emitReelExportComplete(payload: {
  template: string;
  durationMs: number;
  codec: 'mp4' | 'webm';
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.complete', {
    template: payload.template,
    duration_ms: Number.isFinite(payload.durationMs) ? Math.round(payload.durationMs) : null,
    codec: payload.codec,
    ts: Date.now(),
  });
}

export function emitReelExportError(payload: {
  template: string;
  durationMs: number;
  codec: 'mp4' | 'webm';
  message?: string;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.error', {
    template: payload.template,
    duration_ms: Number.isFinite(payload.durationMs) ? Math.round(payload.durationMs) : null,
    codec: payload.codec,
    message: payload.message ?? null,
    ts: Date.now(),
  });
}
