export type FollowTickEvent = {
  latencyMs: number;
  freq: number;
  autoAdvanceFired: boolean;
  overrideUsed: boolean;
  rpmSends: number;
  canceledQueued: boolean;
};

type TelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

let emitter: TelemetryEmitter | null = null;

export function setFollowTelemetryEmitter(candidate: TelemetryEmitter | null | undefined): void {
  emitter = typeof candidate === 'function' ? candidate : null;
}

export function recordFollowTick(event: FollowTickEvent): void {
  if (!emitter) {
    return;
  }
  try {
    emitter('follow.tick.v1', {
      latencyMs: Number.isFinite(event.latencyMs) ? Math.max(0, Number(event.latencyMs)) : 0,
      freq: Number.isFinite(event.freq) ? Math.max(0, Number(event.freq)) : 0,
      autoAdvanceFired: event.autoAdvanceFired === true,
      overrideUsed: event.overrideUsed === true,
      rpmSends: Number.isFinite(event.rpmSends) ? Math.max(0, Math.floor(event.rpmSends)) : 0,
      canceledQueued: event.canceledQueued === true,
    });
  } catch {
    // ignore telemetry failures
  }
}
