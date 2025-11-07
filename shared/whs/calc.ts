import type { HandicapSetup, TeeRating } from './types';

/** Course Handicap per WHS (no PCC): CH = round(HI * (Slope/113) + (CR - Par)) */
export function courseHandicap(hi: number, tee: TeeRating): number {
  const ch = hi * (tee.slope / 113) + (tee.rating - tee.par);
  return Math.round(ch);
}

/** Playing Handicap = round(CH * allowance%) */
export function playingHandicap(ch: number, allowancePct: number): number {
  return Math.round(ch * (allowancePct / 100));
}

/**
 * Allocate strokes per hole using Stroke Index list (1..N).
 * Returns array length N with strokes for each hole index (0-based).
 */
export function allocateStrokes(ph: number, strokeIndex: number[]): number[] {
  const n = strokeIndex.length;
  if (n === 0) {
    return [];
  }

  const absPh = Math.abs(ph);
  const base = Math.floor(absPh / n);
  const remainder = absPh % n;
  const sign = ph >= 0 ? 1 : -1;

  const strokes = new Array(n).fill(base * sign);
  if (remainder === 0) {
    return strokes;
  }

  const pairs = strokeIndex
    .map((si, idx) => ({ si, idx }))
    .sort((a, b) => a.si - b.si);

  for (let i = 0; i < remainder && i < pairs.length; i += 1) {
    const { idx } = pairs[i];
    strokes[idx] += 1 * sign;
  }

  return strokes;
}

/** Net strokes on a hole = gross - strokesReceived (minimum 1) */
export function netStrokes(gross: number, strokesReceived: number): number {
  const received = strokesReceived || 0;
  return Math.max(1, gross - received);
}

/** Stableford points (standard) = max(0, 2 + (par + strokesReceived - gross)) */
export function stablefordPoints(
  gross: number,
  par: number,
  strokesReceived: number,
): number {
  const received = strokesReceived || 0;
  return Math.max(0, 2 + (par + received - gross));
}

export type NetHole = { hole: number; gross: number; par: number };

export type NetRound = {
  courseHandicap: number;
  playingHandicap: number;
  strokesPerHole: number[];
  holes: Array<{ hole: number; gross: number; net: number; points: number }>;
  totalNet: number;
  totalPoints: number;
};

/** Convenience helper to compute a full NetRound from inputs */
export function computeNetForHoles(
  setup: HandicapSetup,
  holes: NetHole[],
): NetRound {
  const ch = courseHandicap(setup.handicapIndex, setup.tee);
  const ph = playingHandicap(ch, setup.allowancePct);
  const n = holes.length;

  const si =
    setup.tee.strokeIndex && setup.tee.strokeIndex.length === n
      ? setup.tee.strokeIndex
      : Array.from({ length: n }, (_, i) => i + 1);

  const strokes = allocateStrokes(ph, si);
  const scored = holes
    .map((hole, idx) => {
      const received = strokes[idx] ?? 0;
      const net = netStrokes(hole.gross, received);
      const points = stablefordPoints(hole.gross, hole.par, received);
      return {
        hole: hole.hole,
        gross: hole.gross,
        net,
        points,
      };
    })
    .sort((a, b) => a.hole - b.hole);

  const totalNet = scored.reduce((sum, h) => sum + h.net, 0);
  const totalPoints = scored.reduce((sum, h) => sum + h.points, 0);

  return {
    courseHandicap: ch,
    playingHandicap: ph,
    strokesPerHole: strokes,
    holes: scored,
    totalNet,
    totalPoints,
  };
}
