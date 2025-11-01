import type { FollowSnapshot, HoleRef } from './types';

function sanitizeNumber(value: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

function normalizeHeading(value: number): number {
  const normalized = sanitizeNumber(value, 0) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

type SnapshotInput = {
  hole: HoleRef;
  distances: { front: number; middle: number; back: number };
  headingDeg: number;
  playsLikePct?: number | null;
  tournamentSafe: boolean;
  ts?: number;
};

export function buildSnapshot(input: SnapshotInput): FollowSnapshot {
  const ts = Number.isFinite(input.ts ?? NaN) ? Number(input.ts) : Date.now();
  const tournamentSafe = input.tournamentSafe === true;
  const snapshot: FollowSnapshot = {
    ts,
    holeNo: input.hole.number,
    fmb: {
      front: sanitizeNumber(input.distances.front, 0),
      middle: sanitizeNumber(input.distances.middle, 0),
      back: sanitizeNumber(input.distances.back, 0),
    },
    headingDeg: normalizeHeading(input.headingDeg),
    tournamentSafe,
  };
  if (!tournamentSafe && Number.isFinite(input.playsLikePct ?? NaN)) {
    snapshot.playsLikePct = Number(input.playsLikePct);
  }
  return snapshot;
}
