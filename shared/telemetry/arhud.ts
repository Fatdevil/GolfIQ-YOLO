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

export function emitAutoHoleSwitch(
  emitter: TelemetryEmitter | null | undefined,
  payload: {
    courseId: string;
    from: number;
    to: number;
    reason: string;
    confidence: number;
    dwellMs: number;
  },
): void {
  if (typeof emitter !== "function") {
    return;
  }
  try {
    emitter("autohole.switch", payload);
  } catch {
    // emitter errors are non-fatal in QA builds
  }
}

export function emitAutoHoleStatus(
  emitter: TelemetryEmitter | null | undefined,
  payload: {
    courseId: string;
    hole: number;
    confidence: number;
    teeLead: number | null | undefined;
    votes: number;
    auto: boolean;
  },
): void {
  if (typeof emitter !== "function") {
    return;
  }
  try {
    emitter("autohole.status", payload);
  } catch {
    // emitter errors are non-fatal in QA builds
  }
}
