export type GreenIqPuttFeedbackEvent = {
  angleDeg: number;
  angleClass: 'on' | 'ok' | 'off' | 'unknown';
  paceClass: 'too_soft' | 'good' | 'too_firm' | 'unknown';
  holeDist_m?: number;
  endDist_m?: number;
};

type TelemetryEmitter = (event: string, data: Record<string, unknown>) => void;

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
