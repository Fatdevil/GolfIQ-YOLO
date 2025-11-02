import { loadDefaultBaselines, loadDefaultPuttingBaseline, type BaselineSet } from '../sg/baseline';
import type { GeoPoint, HoleState, Lie, RoundState, ShotEvent } from './types';

const EARTH_RADIUS_M = 6_371_000;
export const JITTER_M = 1.5;
const REPEAT_WINDOW_MS = 5_000;

const lieToBaseline: Record<Lie, keyof BaselineSet> = {
  Tee: 'tee',
  Fairway: 'fairway',
  Rough: 'rough',
  Sand: 'sand',
  Recovery: 'recovery',
  Green: 'green',
  Penalty: 'recovery',
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function clampDistance(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return numeric;
}

function computeToPin(hole: HoleState, point?: GeoPoint, fallback?: number): number | undefined {
  if (!point) {
    return fallback;
  }
  if (hole.pin) {
    return distanceMeters(point, hole.pin);
  }
  return fallback;
}

function shouldCoalesce(previous: ShotEvent | undefined, current: ShotEvent): boolean {
  if (!previous) {
    return false;
  }
  const delta = current.start.ts - previous.start.ts;
  if (!Number.isFinite(delta) || delta < 0 || delta > REPEAT_WINDOW_MS) {
    return false;
  }
  const distance = distanceMeters(previous.start, current.start);
  return distance <= JITTER_M;
}

export type CarryUpdate = {
  carry_m: number;
  setEnd: boolean;
  end?: GeoPoint;
  endLie?: Lie;
  toPinEnd_m?: number;
};

export function inferCarryFromNext(
  prev: ShotEvent,
  nextStart: GeoPoint,
  nextLie: Lie,
  nextToPinStart_m: number,
  jitter_m: number,
  shouldCoalesceFn: (p: ShotEvent, n: ShotEvent) => boolean
): CarryUpdate {
  const basePoint: GeoPoint = prev.end ?? prev.start;
  const raw = distanceMeters(basePoint, nextStart);
  const syntheticNext: ShotEvent = {
    ...prev,
    start: nextStart,
    startLie: nextLie,
  };
  const coalesced = raw <= jitter_m || shouldCoalesceFn(prev, syntheticNext);

  if (coalesced) {
    return { carry_m: 0, setEnd: false };
  }

  return {
    carry_m: raw,
    setEnd: true,
    end: nextStart,
    endLie: nextLie,
    toPinEnd_m: prev.toPinEnd_m ?? nextToPinStart_m,
  };
}

export interface HoleMetrics {
  fir: boolean | null;
  gir: boolean | null;
  reachedGreenAt: number | null;
}

function computeShotSG(shot: ShotEvent, baselines: BaselineSet): number | undefined {
  if (shot.kind === 'Penalty') {
    return -1;
  }
  const startDistance = clampDistance(shot.toPinStart_m, 0);
  const endDistance = clampDistance(shot.toPinEnd_m ?? startDistance, startDistance);
  if (shot.kind === 'Putt' || shot.startLie === 'Green') {
    const baseline = loadDefaultPuttingBaseline();
    const startExp = baseline(startDistance);
    const endExp = shot.endLie === 'Green' && endDistance <= 0.3 ? 0 : baseline(endDistance);
    const sgValue = startExp - 1 - endExp;
    return Number.isFinite(sgValue) ? sgValue : undefined;
  }
  const startBaseline = baselines[lieToBaseline[shot.startLie]];
  const endBaseline = baselines[lieToBaseline[shot.endLie ?? shot.startLie]];
  const startExp = startBaseline(startDistance);
  const endExp = shot.endLie === 'Green' && endDistance <= 0.3 ? 0 : endBaseline(endDistance);
  const sg = startExp - 1 - endExp;
  return Number.isFinite(sg) ? sg : undefined;
}

export type DeriveContext = {
  round: RoundState;
  hole: HoleState;
  baselines?: BaselineSet;
};

export function updateHoleDerivations(
  hole: HoleState,
  par: number,
  opts: { jitter_m: number; shouldCoalesce: (p: ShotEvent, n: ShotEvent) => boolean }
): HoleMetrics {
  const shots = [...hole.shots].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  for (let i = 1; i < shots.length; i += 1) {
    const prev = shots[i - 1];
    const curr = shots[i];
    if (!prev.end || prev.carry_m == null) {
      const update = inferCarryFromNext(
        prev,
        curr.start,
        curr.startLie,
        curr.toPinStart_m ?? 0,
        opts.jitter_m,
        opts.shouldCoalesce
      );
      prev.carry_m = update.carry_m;
      if (update.setEnd) {
        prev.end = update.end!;
        prev.endLie = update.endLie ?? prev.endLie;
        prev.toPinEnd_m = update.toPinEnd_m ?? prev.toPinEnd_m;
      }
    }
  }

  let fir: boolean | null = null;
  if (shots.length > 0) {
    const tee = shots[0];
    if (tee.end || shots.length > 1) {
      fir =
        tee.endLie === 'Fairway'
          ? true
          : tee.endLie
          ? false
          : null;
    }
  }

  if (par <= 3) {
    fir = null;
  }

  let reachedGreenAt: number | null = null;
  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    const seq = Number.isFinite(Number(shot.seq)) ? Number(shot.seq) : i + 1;
    const hitGreen =
      shot.startLie === 'Green' || shot.kind === 'Putt' || shot.endLie === 'Green';
    if (hitGreen) {
      reachedGreenAt =
        reachedGreenAt == null ? seq : Math.min(reachedGreenAt, seq);
    }
  }

  const gir: boolean | null =
    reachedGreenAt == null ? null : reachedGreenAt <= Math.max(1, par - 2);

  hole.metrics = { ...(hole.metrics ?? {}), fir, gir, reachedGreenAt };

  return { fir, gir, reachedGreenAt };
}

export function deriveHoleState({ hole, round, baselines }: DeriveContext): HoleState {
  const baselineSet = baselines ?? loadDefaultBaselines();
  const nextShots: ShotEvent[] = [];
  let totalSG = 0;
  let strokes = 0;
  let putts = 0;
  let penalties = 0;

  for (let idx = 0; idx < hole.shots.length; idx += 1) {
    const shot = hole.shots[idx];
    const clone: ShotEvent = {
      ...shot,
      seq: Number.isFinite(Number(shot.seq)) ? Number(shot.seq) : idx + 1,
      start: { ...shot.start },
      end: shot.end ? { ...shot.end } : undefined,
    };
    const toPinStart = computeToPin(hole, clone.start, clone.toPinStart_m);
    if (Number.isFinite(toPinStart ?? NaN)) {
      clone.toPinStart_m = toPinStart;
    }
    if (clone.end) {
      const toPinEnd = computeToPin(hole, clone.end, clone.toPinEnd_m);
      if (Number.isFinite(toPinEnd ?? NaN)) {
        clone.toPinEnd_m = toPinEnd;
      }
    }
    nextShots.push(clone);
  }

  const workingHole: HoleState = { ...hole, shots: nextShots };
  const metrics = updateHoleDerivations(workingHole, workingHole.par, {
    jitter_m: JITTER_M,
    shouldCoalesce,
  });

  for (let idx = 0; idx < nextShots.length; idx += 1) {
    const clone = nextShots[idx];
    if (clone.end) {
      const toPinEnd = computeToPin(hole, clone.end, clone.toPinEnd_m);
      if (Number.isFinite(toPinEnd ?? NaN)) {
        clone.toPinEnd_m = toPinEnd;
      }
    }
    const sg = computeShotSG(clone, baselineSet);
    if (Number.isFinite(sg ?? NaN)) {
      clone.sg = sg;
      totalSG += sg!;
    } else {
      clone.sg = undefined;
    }
    strokes += 1;
    if (clone.kind === 'Penalty') {
      penalties += 1;
    }
    if (clone.kind === 'Putt' || clone.startLie === 'Green') {
      putts += 1;
    }
  }

  if (hole.manualScore !== undefined && Number.isFinite(hole.manualScore)) {
    strokes = Math.max(0, Math.floor(hole.manualScore));
  }
  if (hole.manualPutts !== undefined && Number.isFinite(hole.manualPutts)) {
    putts = Math.max(0, Math.floor(hole.manualPutts));
  }

  return {
    ...hole,
    shots: nextShots,
    sgTotal: nextShots.length ? totalSG : undefined,
    strokes: nextShots.length ? strokes : hole.manualScore,
    putts: nextShots.length ? putts : hole.manualPutts,
    penalties: nextShots.length ? penalties : hole.penalties,
    metrics,
  };
}

export function updateRoundHole(round: RoundState, holeNumber: number, baselines?: BaselineSet): RoundState {
  const hole = round.holes[holeNumber];
  if (!hole) {
    return round;
  }
  const updatedHole = deriveHoleState({ round, hole, baselines });
  return {
    ...round,
    holes: {
      ...round.holes,
      [holeNumber]: updatedHole,
    },
  };
}

export function computeCarry(previous: GeoPoint | null, current: GeoPoint): number {
  if (!previous) {
    return 0;
  }
  const dist = distanceMeters(previous, current);
  return dist <= JITTER_M ? 0 : dist;
}
