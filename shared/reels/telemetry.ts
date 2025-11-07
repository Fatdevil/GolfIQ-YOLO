import type { TracerSource } from '../tracer/types';

type ReelsTelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

let emitter: ReelsTelemetryEmitter | null = null;
const recordedShots = new WeakSet<object>();

export function setReelsTelemetryEmitter(candidate: ReelsTelemetryEmitter | null | undefined): void {
  emitter = typeof candidate === 'function' ? candidate : null;
}

export function recordTracerTelemetry(
  shot: { id?: string | null },
  meta: { estimated: boolean; source: TracerSource; sampleCount: number; flags: string[] },
): void {
  if (!emitter || !shot) {
    return;
  }
  if (recordedShots.has(shot as object)) {
    return;
  }
  recordedShots.add(shot as object);
  try {
    emitter('reel.tracer', {
      shotId: shot.id ?? null,
      estimated: Boolean(meta.estimated),
      source: meta.source,
      samples: meta.sampleCount,
      flags: meta.flags,
    });
  } catch (error) {
    console.warn('[reels/telemetry] tracer emit failed', error);
  }
}

export function recordReelExport(result: { format: 'mp4' | 'webm' | 'error'; durationMs: number }): void {
  if (!emitter) {
    return;
  }
  try {
    emitter('reel.export', {
      format: result.format,
      duration_ms: result.durationMs,
    });
  } catch (error) {
    console.warn('[reels/telemetry] export emit failed', error);
  }
}
