import {
  allocateStrokes,
  courseHandicap,
  netStrokes,
  playingHandicap,
  stablefordPoints,
} from '../whs/calc';
import type { HandicapSetup } from '../whs/types';

export type HoleInput = { hole: number; par: number; gross: number };

export type NetResult = {
  courseHandicap: number;
  playingHandicap: number;
  strokesPerHole: number[];
  holes: Array<{ hole: number; gross: number; net: number; points: number }>;
  totalNet: number;
  totalPoints: number;
};

export type RoundAggregate = {
  ph: number;
  totalNet: number;
  totalPoints: number;
};

export function computeNetForRound(setup: HandicapSetup, holes: HoleInput[]): NetResult {
  const ch = courseHandicap(setup.handicapIndex, setup.tee);
  const ph = playingHandicap(ch, setup.allowancePct);
  const totalHoles = holes.length;

  const strokeIndex =
    setup.tee.strokeIndex && setup.tee.strokeIndex.length === totalHoles
      ? setup.tee.strokeIndex
      : Array.from({ length: totalHoles }, (_, i) => i + 1);

  const strokes = allocateStrokes(ph, strokeIndex);

  const scored = holes
    .map((hole) => {
      const idx = Math.max(0, Math.min(totalHoles - 1, hole.hole - 1));
      const received = strokes[idx] ?? 0;
      const net = netStrokes(hole.gross, received);
      const points = stablefordPoints(hole.gross, hole.par, received);
      return { hole: hole.hole, gross: hole.gross, net, points };
    })
    .sort((a, b) => a.hole - b.hole);

  const totalNet = scored.reduce((acc, hole) => acc + hole.net, 0);
  const totalPoints = scored.reduce((acc, hole) => acc + hole.points, 0);

  return {
    courseHandicap: ch,
    playingHandicap: ph,
    strokesPerHole: strokes,
    holes: scored,
    totalNet,
    totalPoints,
  };
}

export function computeAggregateForFormat(
  format: 'stroke' | 'stableford',
  setup: HandicapSetup,
  holes: HoleInput[],
): RoundAggregate {
  const result = computeNetForRound(setup, holes);
  const totalPoints = format === 'stableford' ? result.totalPoints : result.totalPoints;
  return {
    ph: result.playingHandicap,
    totalNet: result.totalNet,
    totalPoints,
  };
}
