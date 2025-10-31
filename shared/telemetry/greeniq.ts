export type GreenIqPuttFeedbackEvent = {
  angleDeg: number;
  signedAngleDeg?: number;
  angleClass: 'on' | 'ok' | 'off' | 'unknown';
  paceClass: 'too_soft' | 'good' | 'too_firm' | 'unknown';
  holeDist_m?: number;
  endDist_m?: number;
  aimAdjust_cm?: number;
  lateralMiss_cm?: number;
  thresholds?: { on: number; ok: number } | null;
};

type TelemetryEmitter = (event: string, data: Record<string, unknown>) => void;

export type GreenIqBreakHintEvent = {
  length_m: number;
  angleDeg: number;
  paceRatio: number;
  slope_pct?: number;
  stimp?: number;
  aimCm?: number | null;
  aimSide: 'left' | 'right' | 'center' | 'unknown';
  tempoHint: 'softer' | 'firmer' | 'good';
  confidence: 'low' | 'med' | 'high';
};

export function emitGreenIqTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: GreenIqPuttFeedbackEvent,
): void {
  if (typeof emitter !== 'function') {
    return;
  }
  try {
    emitter('greeniq.putt_feedback.v1', payload);
  } catch (error) {
    // ignore emitter failures
  }
}

export function emitGreenIqBreakTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: GreenIqBreakHintEvent,
  options?: { enabled?: boolean },
): void {
  if (!options?.enabled) {
    return;
  }
  if (typeof emitter !== 'function') {
    return;
  }
  try {
    emitter('greeniq.break.v1', payload);
  } catch {
    // ignore emitter failures
  }
}
