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

export function emitReelExportOpened(): void {
  safeEmit('reel.export.opened', {
    ts: Date.now(),
  });
}

export function emitReelExportOptions(payload: {
  presetId: string;
  watermark: boolean;
  hasCaption: boolean;
  audio: boolean;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.options', {
    preset_id: payload.presetId,
    watermark: Boolean(payload.watermark),
    has_caption: Boolean(payload.hasCaption),
    audio: Boolean(payload.audio),
    ts: Date.now(),
  });
}

export function emitReelExportSubmitted(payload: {
  presetId: string;
  watermark: boolean;
  hasCaption: boolean;
  audio: boolean;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.submitted', {
    preset_id: payload.presetId,
    watermark: Boolean(payload.watermark),
    has_caption: Boolean(payload.hasCaption),
    audio: Boolean(payload.audio),
    ts: Date.now(),
  });
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

export function emitReelExportSuccess(payload: {
  presetId: string;
  codec: 'video/mp4' | 'video/webm';
  frames: number;
  durationMs: number;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.success', {
    preset_id: payload.presetId,
    codec: payload.codec,
    frames: Number.isFinite(payload.frames) ? Math.round(payload.frames) : null,
    duration_ms: Number.isFinite(payload.durationMs) ? Math.round(payload.durationMs) : null,
    ts: Date.now(),
  });
}

export function emitReelExportFailure(payload: {
  presetId: string;
  stage: 'init' | 'encode' | 'finalize';
  message?: string | null;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('reel.export.error', {
    preset_id: payload.presetId,
    stage: payload.stage,
    message: payload.message ?? null,
    ts: Date.now(),
  });
}
