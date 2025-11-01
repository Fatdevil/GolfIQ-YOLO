export type ShotLoggedEvent = {
  hole: number;
  kind: string;
  club?: string;
  carry_m?: number;
  sg?: number;
  toPinStart_m?: number;
  tournamentSafe: boolean;
};

export type PinSetEvent = {
  hole: number;
  distFromMiddle_m?: number;
};

export type AutoAdvanceEvent = {
  holeFrom: number;
  holeTo: number;
  reason: 'leaveGreen' | 'manual';
};

type TelemetryEmitter = (event: string, payload: Record<string, unknown>) => void;

let emitter: TelemetryEmitter | null = null;

export function setRoundTelemetryEmitter(candidate: TelemetryEmitter | null | undefined): void {
  emitter = typeof candidate === 'function' ? candidate : null;
}

function emit(event: string, payload: Record<string, unknown>): void {
  if (!emitter) {
    return;
  }
  try {
    emitter(event, payload);
  } catch {
    // ignore telemetry failures
  }
}

export function recordShotLogged(event: ShotLoggedEvent): void {
  emit('round.shot.logged.v1', {
    hole: Number.isFinite(event.hole) ? Math.max(1, Math.floor(event.hole)) : 0,
    kind: event.kind,
    club: event.club ?? null,
    carry_m: Number.isFinite(event.carry_m) ? Number(event.carry_m) : null,
    sg: Number.isFinite(event.sg) ? Number(event.sg) : null,
    toPinStart_m: Number.isFinite(event.toPinStart_m) ? Number(event.toPinStart_m) : null,
    tournamentSafe: event.tournamentSafe === true,
  });
}

export function recordPinSet(event: PinSetEvent): void {
  emit('round.pin.set.v1', {
    hole: Number.isFinite(event.hole) ? Math.max(1, Math.floor(event.hole)) : 0,
    distFromMiddle_m: Number.isFinite(event.distFromMiddle_m) ? Number(event.distFromMiddle_m) : null,
  });
}

export function recordAutoAdvance(event: AutoAdvanceEvent): void {
  emit('round.auto.advance.v1', {
    holeFrom: Number.isFinite(event.holeFrom) ? Math.max(0, Math.floor(event.holeFrom)) : 0,
    holeTo: Number.isFinite(event.holeTo) ? Math.max(0, Math.floor(event.holeTo)) : 0,
    reason: event.reason,
  });
}
