type TelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

type DrillTelemetryPayload = {
  key: string;
  club?: string | null;
  drill?: string | null;
  today?: number | null;
  ema?: number | null;
  delta?: number | null;
  target?: { min: number | null; max: number | null } | null;
  samples?: number | null;
};

export const sanitizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const safeEmit = (
  emitter: TelemetryEmitter | null | undefined,
  event: string,
  payload: Record<string, unknown>,
): void => {
  if (typeof emitter !== 'function') {
    return;
  }
  try {
    emitter(event, payload);
  } catch {
    // ignore telemetry errors
  }
};

const normalizeDrillPayload = (
  payload: DrillTelemetryPayload,
): Record<string, unknown> => ({
  key: payload.key,
  club: payload.club ?? null,
  drill: payload.drill ?? null,
  today: sanitizeNumber(payload.today ?? null),
  ema: sanitizeNumber(payload.ema ?? null),
  delta: sanitizeNumber(payload.delta ?? null),
  targetMin: sanitizeNumber(payload.target?.min ?? null),
  targetMax: sanitizeNumber(payload.target?.max ?? null),
  samples: sanitizeNumber(payload.samples ?? null),
  ts: Date.now(),
});

export const emitLearningDrillStart = (
  emitter: TelemetryEmitter | null | undefined,
  payload: DrillTelemetryPayload,
): void => {
  if (!payload || !payload.key) {
    return;
  }
  safeEmit(emitter, 'learning.drill.start', normalizeDrillPayload(payload));
};

export const emitLearningDrillEnd = (
  emitter: TelemetryEmitter | null | undefined,
  payload: DrillTelemetryPayload,
): void => {
  if (!payload || !payload.key) {
    return;
  }
  safeEmit(emitter, 'learning.drill.end', normalizeDrillPayload(payload));
};

export const emitLearningDrillDelta = (
  emitter: TelemetryEmitter | null | undefined,
  payload: DrillTelemetryPayload,
): void => {
  if (!payload || !payload.key) {
    return;
  }
  safeEmit(emitter, 'learning.drill.delta', normalizeDrillPayload(payload));
};
