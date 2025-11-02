export type FollowTickEvent = {
  latencyMs: number;
  freq: number;
  autoAdvanceFired: boolean;
  overrideUsed: boolean;
  rpmSends: number;
  canceledQueued: boolean;
};

export type FollowAutoEvent = {
  from: number;
  to: number;
  reason: 'teeLock' | 'leaveGreen' | 'manual';
};

export type HoleSnapEvent = {
  holeId: number;
  kind: 'tee' | 'green';
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

export function recordAutoEvent(event: FollowAutoEvent): void {
  if (!emitter) {
    return;
  }
  try {
    emitter('follow.auto_event.v2', {
      from: Number.isFinite(event.from) ? Math.max(0, Math.floor(event.from)) : 0,
      to: Number.isFinite(event.to) ? Math.max(0, Math.floor(event.to)) : 0,
      reason: event.reason === 'teeLock' || event.reason === 'manual' ? event.reason : 'leaveGreen',
    });
  } catch {
    // ignore telemetry failures
  }
}

export function recordHoleSnap(event: HoleSnapEvent): void {
  if (!emitter) {
    return;
  }
  try {
    const holeId = Number.isFinite(event.holeId) ? Math.max(0, Math.floor(event.holeId)) : 0;
    const kind = event.kind === 'tee' ? 'tee' : 'green';
    emitter('follow.hole_snap.v1', { holeId, kind });
  } catch {
    // ignore telemetry failures
  }
}
