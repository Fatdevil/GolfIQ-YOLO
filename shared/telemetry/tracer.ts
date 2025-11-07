export type TracerTelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

let emitter: TracerTelemetryEmitter | null = null;

function safeEmit(event: string, payload: Record<string, unknown>): void {
  if (!emitter) {
    return;
  }
  try {
    emitter(event, payload);
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[telemetry/tracer] emit failed', error);
    }
  }
}

export function setTracerTelemetryEmitter(candidate: TracerTelemetryEmitter | null | undefined): void {
  emitter = typeof candidate === 'function' ? candidate : null;
}

export function emitTracerCalibration(payload: {
  quality: number;
  yardage_m: number;
  holeBearingDeg?: number;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('tracer.calibrate.v1', {
    quality: Number.isFinite(payload.quality) ? Number(payload.quality) : null,
    yardage_m: Number.isFinite(payload.yardage_m) ? Number(payload.yardage_m) : null,
    holeBearingDeg: Number.isFinite(payload.holeBearingDeg ?? null)
      ? Number(payload.holeBearingDeg)
      : null,
    ts: Date.now(),
  });
}

export function emitTracerRender(payload: {
  source: string;
  carry_m: number | null;
  apex_m: number | null;
}): void {
  if (!payload) {
    return;
  }
  safeEmit('tracer.render.v1', {
    source: payload.source,
    carry_m: Number.isFinite(payload.carry_m ?? NaN) ? payload.carry_m : null,
    apex_m: Number.isFinite(payload.apex_m ?? NaN) ? payload.apex_m : null,
    ts: Date.now(),
  });
}
