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

export type AutoReconcileEvent = {
  roundId: string;
  hole: number;
  applied: number;
  rejected: number;
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

export function recordAutoReconcile(event: AutoReconcileEvent): void {
  const roundId = typeof event.roundId === 'string' ? event.roundId.trim() : '';
  if (!roundId) {
    return;
  }
  emit('round.auto.reconcile.v1', {
    roundId,
    hole: Number.isFinite(event.hole) ? Math.max(0, Math.floor(event.hole)) : 0,
    applied: Number.isFinite(event.applied) ? Math.max(0, Math.floor(event.applied)) : 0,
    rejected: Number.isFinite(event.rejected) ? Math.max(0, Math.floor(event.rejected)) : 0,
  });
}

type RoundFinishEvent = {
  strokes: number;
  putts: number;
  penalties: number;
  sg: { ott: number; app: number; arg: number; putt: number; total: number };
  firPct: number | null;
  girPct: number | null;
  durationMin: number;
};

export function recordRoundFinish(event: RoundFinishEvent): void {
  emit('round.finish.v1', {
    strokes: Number.isFinite(event.strokes) ? Math.max(0, Math.floor(event.strokes)) : 0,
    putts: Number.isFinite(event.putts) ? Math.max(0, Math.floor(event.putts)) : 0,
    penalties: Number.isFinite(event.penalties) ? Math.max(0, Math.floor(event.penalties)) : 0,
    sg: {
      ott: Number.isFinite(event.sg.ott) ? Number(event.sg.ott) : 0,
      app: Number.isFinite(event.sg.app) ? Number(event.sg.app) : 0,
      arg: Number.isFinite(event.sg.arg) ? Number(event.sg.arg) : 0,
      putt: Number.isFinite(event.sg.putt) ? Number(event.sg.putt) : 0,
      total: Number.isFinite(event.sg.total) ? Number(event.sg.total) : 0,
    },
    firPct: Number.isFinite(event.firPct ?? NaN) ? Math.max(0, Math.min(1, Number(event.firPct))) : null,
    girPct: Number.isFinite(event.girPct ?? NaN) ? Math.max(0, Math.min(1, Number(event.girPct))) : null,
    durationMin: Number.isFinite(event.durationMin) ? Math.max(0, Number(event.durationMin)) : 0,
  });
}
