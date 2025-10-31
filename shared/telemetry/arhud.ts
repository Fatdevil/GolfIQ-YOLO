export type TelemetryEmitter = (event: string, data: Record<string, unknown>) => void;

export type RecenterTelemetryEvent = {
  lockMs: number;
  outcome: "locked" | "timeout";
  avgErrDeg: number;
  rmsErrDeg: number;
};

let recenterTelemetryEnabled = false;

export function setRecenterTelemetryEnabled(value: boolean): void {
  recenterTelemetryEnabled = value === true;
}

export function isRecenterTelemetryEnabled(): boolean {
  return recenterTelemetryEnabled;
}

export function emitRecenterTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: RecenterTelemetryEvent,
): void {
  if (!recenterTelemetryEnabled) {
    return;
  }
  if (typeof emitter !== "function") {
    return;
  }
  try {
    emitter("arhud.recenter.v2", payload);
  } catch {
    // ignore emitter failures in QA builds
  }
}
