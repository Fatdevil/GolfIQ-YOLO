import { loadDefaultBaselines, loadDefaultPuttingBaseline, type BaselineSet } from '../sg/baseline';
import type { GeoPoint, HoleState, Lie, RoundState, ShotEvent } from './types';

const EARTH_RADIUS_M = 6_371_000;
const JITTER_M = 1.5;
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
      if (!prev.end) {
        prev.end = clone.start;
        prev.endLie = clone.startLie;
        prev.toPinEnd_m = clone.toPinStart_m;
      }
      const basePoint = prev.end ?? prev.start;
      const carry = distanceMeters(basePoint, clone.start);
      prev.carry_m = carry <= JITTER_M || shouldCoalesce(prev, clone) ? 0 : carry;
    }
    const sg = computeShotSG(clone, baselineSet);
    if (Number.isFinite(sg ?? NaN)) {
      clone.sg = sg;
      totalSG += sg!;
    } else {
      clone.sg = undefined;
    }
    nextShots.push(clone);
  }

  return {
    ...hole,
    shots: nextShots,
    sgTotal: nextShots.length ? totalSG : undefined,
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
