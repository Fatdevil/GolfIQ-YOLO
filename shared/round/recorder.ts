import { JITTER_M, distanceMeters, deriveHoleState } from './derive';
import { getRoundStore } from './storage';
import type { GeoPoint, HoleState, Lie, RoundState, ShotEvent, ShotKind } from './types';

const DEFAULT_HOLES = 18;
const COALESCE_WINDOW_MS = 3_000;

let loaded = false;
let activeRound: RoundState | null = null;
const listeners = new Set<(round: RoundState | null) => void>();

function cloneRound(state: RoundState | null): RoundState | null {
  return state ? (JSON.parse(JSON.stringify(state)) as RoundState) : null;
}

function ensureId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `shot-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function loadActive(): Promise<RoundState | null> {
  if (!loaded) {
    activeRound = await getRoundStore().loadActive();
    loaded = true;
  }
  return cloneRound(activeRound);
}

async function ensureActiveRound(): Promise<RoundState> {
  if (!loaded) {
    await loadActive();
  }
  if (!activeRound) {
    throw new Error('No active round.');
  }
  if (activeRound.finishedAt) {
    throw new Error('Round already finished.');
  }
  return activeRound;
}

function resolveHole(round: RoundState, holeNumber?: number): [number, HoleState] {
  const holeNo = holeNumber ?? round.currentHole;
  const hole = round.holes[holeNo];
  if (!hole) {
    throw new Error(`Unknown hole ${holeNo}`);
  }
  return [holeNo, hole];
}

function applyHole(round: RoundState, holeNumber: number, hole: HoleState): RoundState {
  const updatedHole = deriveHoleState({ round: { ...round, holes: { ...round.holes, [holeNumber]: hole } }, hole });
  return {
    ...round,
    holes: {
      ...round.holes,
      [holeNumber]: updatedHole,
    },
  };
}

function sanitizeGeoPoint(point: GeoPoint): GeoPoint {
  return {
    lat: Number(point.lat),
    lon: Number(point.lon),
    ts: Number.isFinite(Number(point.ts)) ? Number(point.ts) : Date.now(),
  };
}

function buildShot(hole: number, seq: number, args: {
  loc: GeoPoint;
  lie: Lie;
  club?: string;
  source?: string;
  kind: ShotKind;
  toPinStart_m?: number;
  playsLikePct?: number;
}): ShotEvent {
  return {
    id: ensureId(),
    hole,
    seq,
    start: sanitizeGeoPoint(args.loc),
    startLie: args.lie,
    club: args.club,
    source: args.source,
    kind: args.kind,
    toPinStart_m: Number.isFinite(Number(args.toPinStart_m)) ? Number(args.toPinStart_m) : undefined,
    playsLikePct: Number.isFinite(Number(args.playsLikePct)) ? Number(args.playsLikePct) : undefined,
  };
}

type AddShotArgs = {
  kind: ShotKind;
  start: GeoPoint;
  startLie: Lie;
  club?: string;
  source?: string;
  toPinStart_m?: number;
  playsLikePct?: number;
  force?: boolean;
};

async function persist(state: RoundState | null): Promise<void> {
  await getRoundStore().save(state);
  activeRound = cloneRound(state);
  const snapshot = cloneRound(activeRound);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener failures
    }
  }
}

function normalizeTimestamp(ts: number | undefined): number {
  if (Number.isFinite(Number(ts))) {
    return Math.max(0, Math.floor(Number(ts)));
  }
  return Date.now();
}

async function startNewRound(
  courseId: string,
  holeCount: number,
  startedAt: number | undefined,
  tournamentSafe: boolean,
): Promise<RoundState> {
  const store = getRoundStore();
  const round = await store.newRound(courseId, holeCount, normalizeTimestamp(startedAt), tournamentSafe);
  activeRound = round;
  loaded = true;
  return cloneRound(round)!;
}

export const RoundRecorder = {
  async startRound(
    courseId: string,
    holeCount = DEFAULT_HOLES,
    startedAt: number | undefined = Date.now(),
    tournamentSafe = false,
  ): Promise<RoundState> {
    return startNewRound(courseId, holeCount, startedAt, tournamentSafe);
  },

  async resumeRound(): Promise<RoundState> {
    const round = await this.getActiveRound();
    if (!round) {
      throw new Error('No round to resume.');
    }
    return round;
  },

  async getActiveRound(): Promise<RoundState | null> {
    const round = await loadActive();
    if (!round || round.finishedAt) {
      return null;
    }
    return round;
  },

  async getStoredRound(): Promise<RoundState | null> {
    return loadActive();
  },

  subscribe(listener: (round: RoundState | null) => void): () => void {
    listeners.add(listener);
    listener(cloneRound(activeRound));
    return () => {
      listeners.delete(listener);
    };
  },

  async setPin(holeNumber: number, pin: { lat: number; lon: number }): Promise<void> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round, holeNumber);
    const updated = applyHole(round, holeNo, { ...hole, pin });
    await persist(updated);
  },

  async addShot(
    holeNumber: number | undefined,
    shot: AddShotArgs,
  ): Promise<{ shot: ShotEvent; coalesced: boolean } | null> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round, holeNumber);
    const previous = hole.shots.at(-1);
    const candidate = buildShot(holeNo, hole.shots.length + 1, {
      loc: shot.start,
      lie: shot.startLie,
      club: shot.club,
      source: shot.source,
      kind: shot.kind,
      toPinStart_m: shot.toPinStart_m,
      playsLikePct: shot.playsLikePct,
    });

    if (previous) {
      const deltaMs = candidate.start.ts - previous.start.ts;
      const distance = distanceMeters(previous.end ?? previous.start, candidate.start);
      if (
        deltaMs >= 0 &&
        deltaMs <= COALESCE_WINDOW_MS &&
        distance <= JITTER_M &&
        shot.kind !== 'Penalty'
      ) {
        const mutatedPrev: ShotEvent = {
          ...previous,
          kind: shot.kind,
          startLie: shot.startLie,
          club: shot.club ?? previous.club,
          toPinStart_m: Number.isFinite(Number(shot.toPinStart_m)) ? Number(shot.toPinStart_m) : previous.toPinStart_m,
          playsLikePct: Number.isFinite(Number(shot.playsLikePct))
            ? Number(shot.playsLikePct)
            : previous.playsLikePct,
        };
        const nextShots = [...hole.shots.slice(0, -1), mutatedPrev];
        const updated = applyHole(round, holeNo, { ...hole, shots: nextShots });
        await persist(updated);
        const persisted = activeRound?.holes[holeNo].shots.at(-1);
        return persisted ? { shot: { ...persisted }, coalesced: true } : null;
      }
      if (!shot.force && shot.kind !== 'Penalty' && distance < JITTER_M) {
        return previous ? { shot: { ...previous }, coalesced: true } : null;
      }
    }

    const next = applyHole(round, holeNo, { ...hole, shots: [...hole.shots, candidate] });
    await persist(next);
    const persisted = activeRound?.holes[holeNo].shots.at(-1);
    return persisted ? { shot: { ...persisted }, coalesced: false } : null;
  },

  async markHit(args: { club?: string; lie: Lie; loc: GeoPoint; kind?: ShotEvent['kind'] }): Promise<ShotEvent> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round);
    const result = await this.addShot(holeNo, {
      kind: args.kind ?? 'Full',
      start: args.loc,
      startLie: args.lie,
      club: args.club,
    });
    if (!result) {
      throw new Error('Failed to record shot');
    }
    return result.shot;
  },

  async markPutt(args: { loc: GeoPoint }): Promise<ShotEvent> {
    return this.markHit({ loc: args.loc, lie: 'Green', club: 'Putter', kind: 'Putt' });
  },

  async addPenalty(holeNumber: number | undefined, reason?: 'OB' | 'Drop' | 'PenaltyStroke'): Promise<ShotEvent> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round, holeNumber);
    const anchor = hole.shots.at(-1)?.end ?? hole.shots.at(-1)?.start;
    const basePoint: GeoPoint = anchor
      ? { ...anchor }
      : { lat: 0, lon: 0, ts: Date.now() };
    const result = await this.addShot(holeNo, {
      kind: 'Penalty',
      start: basePoint,
      startLie: 'Penalty',
      force: true,
    });
    if (!result) {
      throw new Error('Failed to add penalty');
    }
    if (reason) {
      (result.shot as ShotEvent & { penaltyReason?: string }).penaltyReason = reason;
    }
    return result.shot;
  },

  async setPuttCount(holeNumber: number, count: number): Promise<void> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round, holeNumber);
    const nextCount = Math.max(0, Math.floor(Number(count)));
    const updated = applyHole(round, holeNo, { ...hole, manualPutts: nextCount });
    await persist(updated);
  },

  async setManualScore(holeNumber: number, strokes: number): Promise<void> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round, holeNumber);
    const nextScore = Math.max(0, Math.floor(Number(strokes)));
    const updated = applyHole(round, holeNo, { ...hole, manualScore: nextScore });
    await persist(updated);
  },

  async finishRound(finishedAt?: number): Promise<RoundState> {
    const round = await ensureActiveRound();
    const timestamp = normalizeTimestamp(finishedAt);
    const completed: RoundState = { ...round, finishedAt: timestamp };
    await persist(completed);
    return cloneRound(completed)!;
  },

  async clearRound(): Promise<void> {
    await persist(null);
  },

  async advanceHole(): Promise<void> {
    await this.nextHole();
  },

  async holeOut(holeNumber: number, loc: GeoPoint): Promise<void> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round, holeNumber);
    if (!hole.shots.length) {
      throw new Error('Cannot hole out without shots.');
    }
    const last = hole.shots[hole.shots.length - 1];
    const finishedShot: ShotEvent = { ...last, end: loc, endLie: 'Green', toPinEnd_m: 0 };
    const updatedShots: ShotEvent[] = [...hole.shots.slice(0, -1), finishedShot];
    const updated = applyHole(round, holeNo, { ...hole, shots: updatedShots });
    await persist(updated);
  },

  async nextHole(): Promise<void> {
    const round = await ensureActiveRound();
    const next = Math.min(round.currentHole + 1, Object.keys(round.holes).length);
    if (next === round.currentHole) {
      return;
    }
    await persist({ ...round, currentHole: next });
  },

  async prevHole(): Promise<void> {
    const round = await ensureActiveRound();
    const prev = Math.max(1, round.currentHole - 1);
    if (prev === round.currentHole) {
      return;
    }
    await persist({ ...round, currentHole: prev });
  },

  async undoLast(): Promise<void> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round);
    if (!hole.shots.length) {
      return;
    }
    const trimmed: ShotEvent[] = hole.shots
      .slice(0, -1)
      .map((shot, idx): ShotEvent => ({ ...shot, seq: idx + 1 }));
    const updated = applyHole(round, holeNo, { ...hole, shots: trimmed });
    await persist(updated);
  },
};

export function __resetRoundRecorderForTests(): void {
  loaded = false;
  activeRound = null;
  listeners.clear();
}
