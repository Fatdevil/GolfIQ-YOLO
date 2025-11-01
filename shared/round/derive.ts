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

export function updateHoleDerivations({ hole, round, baselines }: DeriveContext): HoleState {
  const baselineSet = baselines ?? loadDefaultBaselines();
  const nextShots: ShotEvent[] = [];
  let totalSG = 0;
  let strokes = 0;
  let putts = 0;
  let penalties = 0;
  let fir: boolean | null = hole.par >= 4 ? false : null;
  let gir: boolean | null = null;
  let reachedGreenAt: number | null = null;

  for (let idx = 0; idx < hole.shots.length; idx += 1) {
    const shot = hole.shots[idx];
    const prev = nextShots[idx - 1];
    const clone: ShotEvent = { ...shot, seq: idx + 1 };
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
    if (prev) {
      const update = inferCarryFromNext(
        prev,
        clone.start,
        clone.startLie,
        clone.toPinStart_m ?? 0,
        JITTER_M,
        shouldCoalesce
      );
      prev.carry_m = update.carry_m;
      if (update.setEnd) {
        prev.end = update.end;
        prev.endLie = update.endLie ?? prev.endLie;
        prev.toPinEnd_m = update.toPinEnd_m ?? prev.toPinEnd_m;
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
    if (clone.seq === 1 && fir !== null) {
      fir = clone.endLie === 'Fairway';
    }
    if (reachedGreenAt === null) {
      const reached = clone.endLie === 'Green' || clone.kind === 'Putt' || clone.startLie === 'Green';
      if (reached) {
        reachedGreenAt = strokes;
      }
    }
    nextShots.push(clone);
  }

  if (hole.manualScore !== undefined && Number.isFinite(hole.manualScore)) {
    strokes = Math.max(0, Math.floor(hole.manualScore));
  }
  if (hole.manualPutts !== undefined && Number.isFinite(hole.manualPutts)) {
    putts = Math.max(0, Math.floor(hole.manualPutts));
  }

  if (nextShots.length === 0) {
    fir = null;
    gir = hole.manualScore !== undefined ? hole.manualScore <= Math.max(0, hole.par - 2) : null;
  } else if (reachedGreenAt !== null) {
    const girLimit = hole.par - 2;
    if (girLimit <= 0) {
      gir = true;
    } else {
      gir = reachedGreenAt <= girLimit;
    }
  } else if (hole.shots.length === 0) {
    gir = null;
  } else {
    gir = false;
  }

  return {
    ...hole,
    shots: nextShots,
    sgTotal: nextShots.length ? totalSG : undefined,
    strokes: nextShots.length ? strokes : hole.manualScore,
    putts: nextShots.length ? putts : hole.manualPutts,
    penalties: nextShots.length ? penalties : hole.penalties,
    fir,
    gir,
  };
}

export function updateRoundHole(round: RoundState, holeNumber: number, baselines?: BaselineSet): RoundState {
  const hole = round.holes[holeNumber];
  if (!hole) {
    return round;
  }
  const updatedHole = updateHoleDerivations({ round, hole, baselines });
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
