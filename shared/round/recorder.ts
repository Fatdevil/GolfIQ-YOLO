import { updateHoleDerivations } from './derive';
import { getRoundStore } from './storage';
import type { GeoPoint, HoleState, Lie, RoundState, ShotEvent, ShotKind } from './types';

const DEFAULT_HOLES = 18;

let loaded = false;
let activeRound: RoundState | null = null;

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
  const updatedHole = updateHoleDerivations({ round: { ...round, holes: { ...round.holes, [holeNumber]: hole } }, hole });
  return {
    ...round,
    holes: {
      ...round.holes,
      [holeNumber]: updatedHole,
    },
  };
}

function buildShot(hole: number, seq: number, args: {
  loc: GeoPoint;
  lie: Lie;
  club?: string;
  kind: ShotKind;
}): ShotEvent {
  return {
    id: ensureId(),
    hole,
    seq,
    start: args.loc,
    startLie: args.lie,
    club: args.club,
    kind: args.kind,
  };
}

async function persist(state: RoundState | null): Promise<void> {
  await getRoundStore().save(state);
  activeRound = cloneRound(state);
}

async function startNewRound(courseId: string, holeCount: number, tournamentSafe: boolean): Promise<RoundState> {
  const store = getRoundStore();
  const round = await store.newRound(courseId, holeCount, Date.now(), tournamentSafe);
  activeRound = round;
  loaded = true;
  return cloneRound(round)!;
}

export const RoundRecorder = {
  async startRound(courseId: string, holeCount = DEFAULT_HOLES, tournamentSafe = false): Promise<RoundState> {
    return startNewRound(courseId, holeCount, tournamentSafe);
  },

  async resumeRound(): Promise<RoundState> {
    const round = await loadActive();
    if (!round) {
      throw new Error('No round to resume.');
    }
    return round;
  },

  async setPin(holeNumber: number, pin: { lat: number; lon: number }): Promise<void> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round, holeNumber);
    const updated = applyHole(round, holeNo, { ...hole, pin });
    await persist(updated);
  },

  async markHit(args: { club?: string; lie: Lie; loc: GeoPoint; kind?: ShotEvent['kind'] }): Promise<ShotEvent> {
    const round = await ensureActiveRound();
    const [holeNo, hole] = resolveHole(round);
    const shot = buildShot(holeNo, hole.shots.length + 1, {
      loc: args.loc,
      lie: args.lie,
      club: args.club,
      kind: args.kind ?? 'Full',
    });
    const updated = applyHole(round, holeNo, { ...hole, shots: [...hole.shots, shot] });
    await persist(updated);
    const result = activeRound?.holes[holeNo].shots.at(-1);
    if (!result) {
      throw new Error('Failed to record shot');
    }
    return { ...result };
  },

  async markPutt(args: { loc: GeoPoint }): Promise<ShotEvent> {
    return this.markHit({ loc: args.loc, lie: 'Green', club: 'Putter', kind: 'Putt' });
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
}
