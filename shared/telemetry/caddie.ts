export type TelemetryEmitter = (event: string, data: Record<string, unknown>) => void;

export type CaddiePlaysLikeEvent = {
  rawDist_m: number;
  distance_m: number;
  factor: number;
  elevDiff_m: number;
  temp_C: number;
  headwind_mps: number;
};

let playsLikeTelemetryEnabled = false;

export function setEnableCaddieTelemetry(value: boolean): void {
  playsLikeTelemetryEnabled = value === true;
}

export function isCaddieTelemetryEnabled(): boolean {
  return playsLikeTelemetryEnabled;
}

export function emitCaddiePlaysLikeTelemetry(
  emitter: TelemetryEmitter | null | undefined,
  payload: CaddiePlaysLikeEvent,
): void {
  if (!playsLikeTelemetryEnabled) {
    return;
  }
  if (typeof emitter !== "function") {
    return;
  }
  try {
    emitter("caddie.playslike.v1", payload);
  } catch (error) {
    // ignore emitter failures
  }
}
